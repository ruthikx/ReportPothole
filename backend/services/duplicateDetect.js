const path = require('path');
const fs = require('fs');
const Ticket = require('../models/Ticket');

let sharp = null;
try {
  sharp = require('sharp');
} catch {
  // If sharp cannot load in the runtime, GPS duplicate detection still runs.
}

const HASH_SIZE = 8;
const IMAGE_HASH_DISTANCE = Number(process.env.IMAGE_HASH_DISTANCE || 10);
const REMOTE_PATH_PATTERN = /^(?:s3|https?):\/\//i;

const resolveLocalImagePath = (filePath) => {
  if (!filePath || REMOTE_PATH_PATTERN.test(filePath)) return null;

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(filePath);

  return fs.existsSync(absolutePath) ? absolutePath : null;
};

const resolveHashInput = (file) => {
  if (!file) return { input: null, reason: 'missing-file' };

  if (Buffer.isBuffer(file.buffer) && file.buffer.length > 0) {
    return { input: file.buffer, source: 'buffer' };
  }

  const directPath = resolveLocalImagePath(file.path);
  if (directPath) return { input: directPath, source: 'path' };

  const destinationPath = file.destination && file.filename
    ? resolveLocalImagePath(path.join(file.destination, file.filename))
    : null;
  if (destinationPath) return { input: destinationPath, source: 'destination-filename' };

  const localUploadFilenamePath = file.filename
    ? resolveLocalImagePath(path.join(__dirname, '..', 'uploads', file.filename))
    : null;
  if (localUploadFilenamePath) return { input: localUploadFilenamePath, source: 'uploads-filename' };

  const localUploadKeyPath = file.key && file.key.startsWith('uploads/')
    ? resolveLocalImagePath(path.join(__dirname, '..', file.key))
    : null;
  if (localUploadKeyPath) return { input: localUploadKeyPath, source: 'uploads-key' };

  if (file.key || file.location || REMOTE_PATH_PATTERN.test(file.path || '')) {
    return { input: null, reason: 'remote-upload-unavailable' };
  }

  return { input: null, reason: 'no-readable-image-source' };
};

const computeImageHash = async (file) => {
  if (!sharp) return null;

  // Hashing requires bytes available to this Node process: a local disk path or
  // an in-memory buffer. S3-only upload metadata is intentionally skipped here.
  const { input } = resolveHashInput(file);
  if (!input) return null;

  try {
    const imageInput = typeof input === 'string' ? await fs.promises.readFile(input) : input;
    const { data } = await sharp(imageInput)
      .resize(HASH_SIZE, HASH_SIZE, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Array.from(data);
    const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
    return pixels.map((value) => (value >= average ? '1' : '0')).join('');
  } catch (err) {
    console.warn('[DuplicateDetect] Image hash skipped:', err.message);
    return null;
  }
};

const hammingDistance = (left, right) => {
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;

  let distance = 0;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) distance += 1;
  }
  return distance;
};

const findGpsDuplicate = async (lng, lat, radiusMetres = 50) => {
  return Ticket.findOne({
    status: { $ne: 'resolved' },
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        $maxDistance: radiusMetres,
      },
    },
  }).sort({ createdAt: -1 });
};

const findImageDuplicate = async (hash, lng, lat, radiusMetres = 100) => {
  if (!hash) return null;

  const candidates = await Ticket.find({
    status: { $ne: 'resolved' },
    'imageHashes.before': { $exists: true, $ne: [] },
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        $maxDistance: radiusMetres,
      },
    },
  })
    .sort({ createdAt: -1 })
    .limit(25);

  return candidates.find((ticket) =>
    (ticket.imageHashes?.before || []).some(
      (candidateHash) => hammingDistance(hash, candidateHash) <= IMAGE_HASH_DISTANCE
    )
  ) || null;
};

const findDuplicate = async (lng, lat, options = {}) => {
  const radiusMetres = options.radiusMetres || 50;
  const gpsDuplicate = await findGpsDuplicate(lng, lat, radiusMetres);
  if (gpsDuplicate) return gpsDuplicate;

  const imageHash = options.imageHash || (options.file ? await computeImageHash(options.file) : null);
  return findImageDuplicate(imageHash, lng, lat, options.imageRadiusMetres || 100);
};

module.exports = {
  computeImageHash,
  findDuplicate,
  findGpsDuplicate,
  findImageDuplicate,
  hammingDistance,
  resolveHashInput,
};
