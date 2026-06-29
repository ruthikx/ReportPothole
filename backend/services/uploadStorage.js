const { DeleteObjectCommand, GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const ImageKit = require('@imagekit/nodejs');
const fs = require('fs');
const path = require('path');

const UPLOAD_KEY_PREFIX = 'uploads/';
const IMAGEKIT_KEY_PREFIX = 'imagekit:';
const IMAGEKIT_URL_PATTERN = /^https?:\/\/(?:[^/]+\.)?imagekit\.io\//i;
const localUploadDir = path.join(__dirname, '..', 'uploads');
const REMOTE_PATH_PATTERN = /^(?:s3|https?):\/\//i;

let s3Client = null;
let s3ClientConfigKey = null;
let imageKitClient = null;
let imageKitClientConfigKey = null;

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/');

const hasRealS3Config = () => (
  process.env.S3_BUCKET &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_ACCESS_KEY_ID !== 'your-aws-access-key' &&
  process.env.AWS_SECRET_ACCESS_KEY !== 'your-aws-secret-key'
);

const isS3StorageEnabled = () => process.env.UPLOAD_STORAGE === 's3' || hasRealS3Config();
const isImageKitStorageEnabled = () => process.env.UPLOAD_STORAGE === 'imagekit';

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

const getImageKitClientConfigKey = () => [
  process.env.IMAGEKIT_PRIVATE_KEY || '',
  process.env.IMAGE_KIT_BASE_URL || '',
].join('|');

const getImageKitClient = () => {
  if (!isImageKitStorageEnabled()) return null;

  const nextConfigKey = getImageKitClientConfigKey();
  if (!imageKitClient || imageKitClientConfigKey !== nextConfigKey) {
    if (!process.env.IMAGEKIT_PRIVATE_KEY) {
      throw new Error('ImageKit upload storage requires IMAGEKIT_PRIVATE_KEY');
    }

    imageKitClient = new ImageKit({
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      ...(process.env.IMAGE_KIT_BASE_URL ? { baseURL: process.env.IMAGE_KIT_BASE_URL } : {}),
    });
    imageKitClientConfigKey = nextConfigKey;
  }

  return imageKitClient;
};

const getUploadStorageMode = () => {
  if (isImageKitStorageEnabled()) return 'imagekit';
  return isS3StorageEnabled() ? 's3' : 'local';
};

const ensureLocalUploadDir = () => {
  fs.mkdirSync(localUploadDir, { recursive: true });
};

const buildUploadKey = (filename) => `${UPLOAD_KEY_PREFIX}${filename}`;
const buildImageKitKey = (fileId) => `${IMAGEKIT_KEY_PREFIX}${fileId}`;

const trimSlashes = (value) => normalizeSlashes(value).replace(/^\/+|\/+$/g, '');

const getImageKitFolder = () => {
  const configuredFolder = process.env.IMAGEKIT_UPLOAD_FOLDER || 'pothole-app/uploads';
  const normalized = trimSlashes(configuredFolder);
  return normalized ? `/${normalized}` : '/';
};

const getImageKitUrlEndpoint = () => (
  process.env.IMAGEKIT_URL_ENDPOINT ||
  process.env.IMAGE_KIT_URL_ENDPOINT ||
  process.env.IMAGEKIT_ENDPOINT ||
  process.env.IMAGE_KIT_ENDPOINT ||
  ''
).replace(/\/+$/, '');

const isImageKitUrl = (value) => IMAGEKIT_URL_PATTERN.test(String(value || ''));

const normalizeImageKitPath = (value) => {
  if (!value || typeof value !== 'string') return null;

  const urlEndpoint = getImageKitUrlEndpoint();
  if (urlEndpoint && value.startsWith(`${urlEndpoint}/`)) {
    return `/${value.slice(urlEndpoint.length).replace(/^\/+/, '')}`;
  }

  if (isImageKitUrl(value)) return value;

  const normalized = normalizeSlashes(value);
  if (!normalized || REMOTE_PATH_PATTERN.test(normalized)) return null;
  if (normalized === '/uploads' || normalized.startsWith('/uploads/')) return null;
  if (normalized === 'uploads' || normalized.startsWith('uploads/')) return null;

  if (normalized.startsWith('/')) return normalized;
  if (urlEndpoint && normalized.includes('/')) return `/${normalized}`;

  return null;
};

const getImageKitStoredValue = (upload) => {
  if (!upload) return null;
  if (typeof upload === 'string') return upload;
  return upload.url || upload.location || upload.imagekitUrl || upload.imagekitFilePath || upload.filePath || null;
};

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

  if (value.startsWith(IMAGEKIT_KEY_PREFIX)) return value;
  if (isImageKitUrl(value)) return value;

  if (REMOTE_PATH_PATTERN.test(value)) return null;

  const pathKey = keyFromLocalPath(value, options.uploadDir || localUploadDir);
  if (pathKey) return pathKey;

  const imageKitPath = normalizeImageKitPath(value);
  if (imageKitPath) return imageKitPath;

  const normalized = normalizeSlashes(value).replace(/^\/+/, '');
  if (!normalized) return null;
  if (normalized.startsWith(UPLOAD_KEY_PREFIX)) return normalized;
  if (normalized.includes('/')) return null;

  return buildUploadKey(path.posix.basename(normalized));
};

const getStoredUploadKey = (upload, options = {}) => {
  if (!upload) return null;
  if (typeof upload === 'string') return normalizeUploadKey(upload, options);

  if ((upload.imagekitFileId || upload.fileId) && upload.url && REMOTE_PATH_PATTERN.test(upload.url)) {
    return upload.url;
  }

  return (
    normalizeUploadKey(getImageKitStoredValue(upload), options) ||
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
    addValue(upload.imagekitFileId ? buildImageKitKey(upload.imagekitFileId) : null);
    addValue(upload.fileId ? buildImageKitKey(upload.fileId) : null);
    addValue(upload.url);
    addValue(upload.location);
    addValue(upload.imagekitUrl);
    addValue(upload.imagekitFilePath);
    addValue(upload.filePath);
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
  if (
    typeof files === 'object' &&
    !files.originalname &&
    !files.key &&
    !files.path &&
    !files.filename &&
    !files.url &&
    !files.location &&
    !files.fileId &&
    !files.imagekitFileId &&
    !files.filePath &&
    !files.imagekitFilePath
  ) {
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
  const storageMode = options.storageMode || getUploadStorageMode();
  const imageKitFileId = upload?.imagekitFileId || upload?.fileId || (
    key?.startsWith(IMAGEKIT_KEY_PREFIX)
      ? key.slice(IMAGEKIT_KEY_PREFIX.length)
      : null
  );

  if (!key && !(storageMode === 'imagekit' && imageKitFileId)) {
    return { deleted: false, key: null, reason: 'unresolvable-upload-key' };
  }

  if (options.isReferenced && await options.isReferenced(key, upload)) {
    return { deleted: false, key, skipped: true, reason: 'referenced' };
  }

  if (storageMode === 'imagekit') {
    if (!imageKitFileId) {
      return { deleted: false, key, skipped: true, reason: 'missing-imagekit-file-id' };
    }

    const client = options.imageKitClient || getImageKitClient();
    if (!client) {
      throw new Error('ImageKit upload cleanup requires an ImageKit client');
    }

    await client.files.delete(imageKitFileId);
    return { deleted: true, key, storage: 'imagekit', fileId: imageKitFileId };
  }

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

const isUploadReferencedByModel = async (Model, upload, key) => {
  const identifiers = getStoredUploadIdentifiers(upload);
  if (key) identifiers.push(key);

  const uniqueIdentifiers = [...new Set(identifiers.filter(Boolean))];
  if (uniqueIdentifiers.length === 0) return false;

  const existingRecord = await Model.exists({
    $or: [
      { 'photos.before': { $in: uniqueIdentifiers } },
      { 'photos.after': { $in: uniqueIdentifiers } },
    ],
  });

  return Boolean(existingRecord);
};

const cleanupTicketUploads = async (Model, files) => cleanupStoredUploads(files, {
  isReferenced: (key, upload) => isUploadReferencedByModel(Model, upload, key),
});

const generatePresignedUrl = async (s3Key) => {
  if (!s3Key) return null;
  if (s3Key.startsWith(IMAGEKIT_KEY_PREFIX)) return null;
  if (/^https?:\/\//i.test(s3Key)) return s3Key;

  const imageKitPath = normalizeImageKitPath(s3Key);
  const urlEndpoint = getImageKitUrlEndpoint();
  if (imageKitPath && urlEndpoint) {
    const client = imageKitClient || (
      process.env.IMAGEKIT_PRIVATE_KEY ? getImageKitClient() : null
    );
    if (client?.helper?.buildSrc) {
      return client.helper.buildSrc({ urlEndpoint, src: imageKitPath });
    }

    return `${urlEndpoint}/${imageKitPath.replace(/^\/+/, '')}`;
  }

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
  buildImageKitKey,
  cleanupStoredUploads,
  cleanupTicketUploads,
  deleteStoredUpload,
  ensureLocalUploadDir,
  flattenUploadedFiles,
  generatePresignedUrl,
  getImageKitClient,
  getImageKitFolder,
  getImageKitUrlEndpoint,
  getS3Client,
  getStoredUploadIdentifiers,
  getStoredUploadKey,
  getUploadStorageMode,
  hasRealS3Config,
  isImageKitStorageEnabled,
  isImageKitUrl,
  isS3StorageEnabled,
  localUploadDir,
  normalizeUploadKey,
  resolveLocalUploadPath,
};
