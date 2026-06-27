const fs = require('fs');
const os = require('os');
const path = require('path');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const {
  cleanupStoredUploads,
  getStoredUploadKey,
  resolveLocalUploadPath,
} = require('../services/uploadStorage');

describe('upload storage cleanup helpers', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pothole-uploads-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('normalizes multer upload metadata to stored upload keys', () => {
    const upload = {
      destination: tempRoot,
      filename: 'report.jpg',
      path: path.join(tempRoot, 'report.jpg'),
    };

    expect(getStoredUploadKey(upload, { uploadDir: tempRoot })).toBe('uploads/report.jpg');
    expect(resolveLocalUploadPath(upload, { uploadDir: tempRoot })).toBe(
      path.join(tempRoot, 'report.jpg')
    );
  });

  test('deletes unused local upload files from a temp upload directory', async () => {
    const localPath = path.join(tempRoot, 'unused.jpg');
    fs.writeFileSync(localPath, 'unused upload');

    const result = await cleanupStoredUploads(
      [{ path: localPath, filename: 'unused.jpg' }],
      { uploadDir: tempRoot, storageMode: 'local' }
    );

    expect(result.deleted).toHaveLength(1);
    expect(result.deleted[0]).toMatchObject({
      key: 'uploads/unused.jpg',
      storage: 'local',
      path: localPath,
    });
    expect(fs.existsSync(localPath)).toBe(false);
  });

  test('skips cleanup when the stored upload belongs to an existing ticket', async () => {
    const localPath = path.join(tempRoot, 'referenced.jpg');
    fs.writeFileSync(localPath, 'existing ticket upload');

    const isReferenced = jest.fn().mockResolvedValue(true);
    const result = await cleanupStoredUploads(
      [{ key: 'uploads/referenced.jpg', path: localPath }],
      { uploadDir: tempRoot, storageMode: 'local', isReferenced }
    );

    expect(result.deleted).toHaveLength(0);
    expect(result.skipped).toEqual([
      {
        deleted: false,
        key: 'uploads/referenced.jpg',
        skipped: true,
        reason: 'referenced',
      },
    ]);
    expect(isReferenced).toHaveBeenCalledWith(
      'uploads/referenced.jpg',
      expect.objectContaining({ key: 'uploads/referenced.jpg' })
    );
    expect(fs.existsSync(localPath)).toBe(true);
  });

  test('deletes unused S3 objects with the uploaded object key', async () => {
    const send = jest.fn().mockResolvedValue({});

    const result = await cleanupStoredUploads(
      [{ key: 'uploads/unused-s3.jpg' }],
      {
        storageMode: 's3',
        bucket: 'pothole-test-bucket',
        s3Client: { send },
      }
    );

    expect(result.deleted).toHaveLength(1);
    expect(result.deleted[0]).toMatchObject({
      key: 'uploads/unused-s3.jpg',
      storage: 's3',
    });
    expect(send).toHaveBeenCalledTimes(1);

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'pothole-test-bucket',
      Key: 'uploads/unused-s3.jpg',
    });
  });
});
