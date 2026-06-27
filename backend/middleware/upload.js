const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const {
  buildUploadKey,
  ensureLocalUploadDir,
  generatePresignedUrl,
  getS3Client,
  isS3StorageEnabled,
  localUploadDir,
} = require('../services/uploadStorage');

const useS3 = isS3StorageEnabled();

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

const upload = multer({
  storage: useS3 ? s3Storage() : localStorage(),
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
