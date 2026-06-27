const { DeleteObjectCommand, GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');

const UPLOAD_KEY_PREFIX = 'uploads/';
const localUploadDir = path.join(__dirname, '..', 'uploads');
const REMOTE_PATH_PATTERN = /^(?:s3|https?):\/\//i;

let s3Client = null;
let s3ClientConfigKey = null;

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/');

const hasRealS3Config = () => (
  process.env.S3_BUCKET &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_ACCESS_KEY_ID !== 'your-aws-access-key' &&
  process.env.AWS_SECRET_ACCESS_KEY !== 'your-aws-secret-key'
);

const isS3StorageEnabled = () => process.env.UPLOAD_STORAGE === 's3' || hasRealS3Config();

const getS3ClientConfigKey = () => [
  process.env.AWS_REGION || 'us-east-1',
  process.env.AWS_ACCESS_KEY_ID || '',
  process.env.AWS_SECRET_ACCESS_KEY || '',
].join('|');

const getS3Client = () => {
  if (!isS3StorageEnabled()) return null;

  const nextConfigKey = getS3ClientConfigKey();
  if (!s3Client || s3ClientConfigKey !== nextConfigKey) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    s3ClientConfigKey = nextConfigKey;
  }

  return s3Client;
};

const getUploadStorageMode = () => (isS3StorageEnabled() ? 's3' : 'local');

const ensureLocalUploadDir = () => {
  fs.mkdirSync(localUploadDir, { recursive: true });
};

const buildUploadKey = (filename) => `${UPLOAD_KEY_PREFIX}${filename}`;

const isPathInside = (candidatePath, parentPath) => {
  const relative = path.relative(parentPath, candidatePath);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const keyFromLocalPath = (filePath, uploadDir = localUploadDir) => {
  if (!filePath || REMOTE_PATH_PATTERN.test(filePath)) return null;

  const absolutePath = path.resolve(filePath);
  const absoluteUploadDir = path.resolve(uploadDir);
  if (!isPathInside(absolutePath, absoluteUploadDir)) return null;

  const relativePath = normalizeSlashes(path.relative(absoluteUploadDir, absolutePath));
  return relativePath ? buildUploadKey(relativePath) : null;
};

const normalizeUploadKey = (value, options = {}) => {
  if (!value) return null;

  if (typeof value !== 'string') {
    return getStoredUploadKey(value, options);
  }

  if (REMOTE_PATH_PATTERN.test(value)) return null;

  const pathKey = keyFromLocalPath(value, options.uploadDir || localUploadDir);
  if (pathKey) return pathKey;

  const normalized = normalizeSlashes(value).replace(/^\/+/, '');
  if (!normalized) return null;
  if (normalized.startsWith(UPLOAD_KEY_PREFIX)) return normalized;
  if (normalized.includes('/')) return null;

  return buildUploadKey(path.posix.basename(normalized));
};

const getStoredUploadKey = (upload, options = {}) => {
  if (!upload) return null;
  if (typeof upload === 'string') return normalizeUploadKey(upload, options);

  return (
    normalizeUploadKey(upload.key, options) ||
    normalizeUploadKey(upload.path, options) ||
    (upload.destination && upload.filename
      ? normalizeUploadKey(path.join(upload.destination, upload.filename), options)
      : null) ||
    normalizeUploadKey(upload.filename, options)
  );
};

const getStoredUploadIdentifiers = (upload, options = {}) => {
  const values = [];
  const addValue = (value) => {
    if (typeof value === 'string' && value) values.push(value);
  };

  if (typeof upload === 'string') {
    addValue(upload);
  } else if (upload) {
    addValue(upload.key);
    addValue(upload.path);
    addValue(upload.filename);
    if (upload.destination && upload.filename) {
      addValue(path.join(upload.destination, upload.filename));
    }
  }

  const key = getStoredUploadKey(upload, options);
  if (key) {
    addValue(key);
    addValue(`/${key}`);
    addValue(path.posix.basename(key));
  }

  return [...new Set(values)];
};

const flattenUploadedFiles = (files) => {
  if (!files) return [];
  if (Array.isArray(files)) return files.flatMap(flattenUploadedFiles);
  if (typeof files === 'object' && !files.originalname && !files.key && !files.path && !files.filename) {
    return Object.values(files).flatMap(flattenUploadedFiles);
  }
  return [files];
};

const resolveLocalUploadPath = (upload, options = {}) => {
  const uploadDir = options.uploadDir || localUploadDir;
  const key = getStoredUploadKey(upload, options);
  if (!key || !key.startsWith(UPLOAD_KEY_PREFIX)) return null;

  const relativePath = key.slice(UPLOAD_KEY_PREFIX.length);
  if (!relativePath) return null;

  const absoluteUploadDir = path.resolve(uploadDir);
  const absolutePath = path.resolve(uploadDir, relativePath);
  return isPathInside(absolutePath, absoluteUploadDir) ? absolutePath : null;
};

const rmLocalUpload = async (localPath) => {
  await fs.promises.rm(localPath, {
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
};

const deleteStoredUpload = async (upload, options = {}) => {
  const key = getStoredUploadKey(upload, options);
  if (!key) {
    return { deleted: false, key: null, reason: 'unresolvable-upload-key' };
  }

  if (options.isReferenced && await options.isReferenced(key, upload)) {
    return { deleted: false, key, skipped: true, reason: 'referenced' };
  }

  const storageMode = options.storageMode || getUploadStorageMode();
  if (storageMode === 's3') {
    const client = options.s3Client || getS3Client();
    const bucket = options.bucket || process.env.S3_BUCKET;
    if (!client || !bucket) {
      throw new Error('S3 upload cleanup requires an S3 client and bucket');
    }

    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return { deleted: true, key, storage: 's3' };
  }

  const localPath = resolveLocalUploadPath(upload, options);
  if (!localPath) {
    return { deleted: false, key, skipped: true, reason: 'invalid-local-upload-path' };
  }

  await rmLocalUpload(localPath);
  return { deleted: true, key, storage: 'local', path: localPath };
};

const cleanupStoredUploads = async (files, options = {}) => {
  const uploads = flattenUploadedFiles(files);
  const results = {
    deleted: [],
    skipped: [],
    failed: [],
  };
  const seenKeys = new Set();

  for (const upload of uploads) {
    const key = getStoredUploadKey(upload, options);
    const dedupeKey = key || JSON.stringify(getStoredUploadIdentifiers(upload, options));
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    try {
      const result = await deleteStoredUpload(upload, options);
      if (result.deleted) {
        results.deleted.push(result);
      } else {
        results.skipped.push(result);
      }
    } catch (err) {
      results.failed.push({ key, error: err });
      if (options.logger !== false) {
        const logger = options.logger || console;
        logger.warn('[UploadStorage] Upload cleanup failed:', err.message);
      }
      if (options.throwOnError) throw err;
    }
  }

  return results;
};

const generatePresignedUrl = async (s3Key) => {
  if (!s3Key) return null;
  if (!isS3StorageEnabled()) {
    const normalized = normalizeSlashes(s3Key);
    if (normalized.startsWith('/uploads/')) return normalized;
    if (normalized.startsWith('uploads/')) return `/${normalized}`;
    return `/uploads/${path.basename(normalized)}`;
  }

  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
};

module.exports = {
  buildUploadKey,
  cleanupStoredUploads,
  deleteStoredUpload,
  ensureLocalUploadDir,
  flattenUploadedFiles,
  generatePresignedUrl,
  getS3Client,
  getStoredUploadIdentifiers,
  getStoredUploadKey,
  getUploadStorageMode,
  hasRealS3Config,
  isS3StorageEnabled,
  localUploadDir,
  normalizeUploadKey,
  resolveLocalUploadPath,
};
