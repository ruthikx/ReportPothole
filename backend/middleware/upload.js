const multer = require('multer');
const multerS3 = require('multer-s3');
const { toFile } = require('@imagekit/nodejs');
const { File } = require('node:buffer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const {
  buildUploadKey,
  ensureLocalUploadDir,
  generatePresignedUrl,
  getImageKitClient,
  getImageKitFolder,
  getS3Client,
  isImageKitStorageEnabled,
  isS3StorageEnabled,
  localUploadDir,
} = require('../services/uploadStorage');

const useS3 = isS3StorageEnabled();
const useImageKit = isImageKitStorageEnabled();

if (typeof globalThis.File === 'undefined') {
  globalThis.File = File;
}

const s3Storage = () =>
  multerS3({
    s3: getS3Client(),
    bucket: process.env.S3_BUCKET,
    acl: 'private',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const key = buildUploadKey(`${uuidv4()}${ext}`);
      cb(null, key);
    },
  });

const localStorage = () =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      ensureLocalUploadDir();
      cb(null, localUploadDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const filename = `${uuidv4()}${ext}`;
      file.key = buildUploadKey(filename);
      cb(null, filename);
    },
  });

const readStreamToBuffer = (stream) => new Promise((resolve, reject) => {
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(Buffer.concat(chunks)));
});

const imageKitStorage = () => ({
  _handleFile: async (req, file, cb) => {
    try {
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `${uuidv4()}${ext}`;
      const buffer = await readStreamToBuffer(file.stream);
      const client = getImageKitClient();
      const response = await client.files.upload({
        file: await toFile(buffer, filename, { type: file.mimetype }),
        fileName: filename,
        folder: getImageKitFolder(),
        useUniqueFileName: false,
        overwriteFile: false,
        tags: ['pothole-app'],
      });

      cb(null, {
        buffer,
        size: buffer.length,
        filename,
        key: response.url || response.filePath,
        location: response.url,
        url: response.url,
        imagekitFileId: response.fileId,
        imagekitFilePath: response.filePath,
        imagekitThumbnailUrl: response.thumbnailUrl,
      });
    } catch (err) {
      cb(err);
    }
  },
  _removeFile: (req, file, cb) => {
    delete file.buffer;
    cb(null);
  },
});

const upload = multer({
  storage: useImageKit ? imageKitStorage() : useS3 ? s3Storage() : localStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === 'image/jpeg' ||
      file.mimetype === 'image/png'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'), false);
    }
  },
});

const exported = { upload, generatePresignedUrl };
Object.defineProperty(exported, 's3Client', {
  enumerable: true,
  get: getS3Client,
});

module.exports = exported;
