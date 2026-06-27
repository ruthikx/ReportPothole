const { S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const hasRealS3Config =
  process.env.S3_BUCKET &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_ACCESS_KEY_ID !== 'your-aws-access-key' &&
  process.env.AWS_SECRET_ACCESS_KEY !== 'your-aws-secret-key';

const useS3 = process.env.UPLOAD_STORAGE === 's3' || hasRealS3Config;
const localUploadDir = path.join(__dirname, '..', 'uploads');

const s3Client = useS3
  ? new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
  : null;

const s3Storage = () =>
  multerS3({
    s3: s3Client,
    bucket: process.env.S3_BUCKET,
    acl: 'private',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const key = `uploads/${uuidv4()}${ext}`;
      cb(null, key);
    },
  });

const localStorage = () =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(localUploadDir, { recursive: true });
      cb(null, localUploadDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const filename = `${uuidv4()}${ext}`;
      file.key = `uploads/${filename}`;
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

const generatePresignedUrl = async (s3Key) => {
  if (!s3Key) return null;
  if (!useS3) {
    const normalized = s3Key.replace(/\\/g, '/');
    if (normalized.startsWith('/uploads/')) return normalized;
    if (normalized.startsWith('uploads/')) return `/${normalized}`;
    return `/uploads/${path.basename(normalized)}`;
  }
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
};

module.exports = { upload, generatePresignedUrl, s3Client };
