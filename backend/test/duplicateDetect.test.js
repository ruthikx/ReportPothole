const { computeImageHash, hammingDistance, resolveHashInput } = require('../services/duplicateDetect');

describe('duplicate detection service', () => {
  test('hammingDistance counts bit differences and rejects incompatible inputs', () => {
    expect(hammingDistance('1010', '1001')).toBe(2);
    expect(hammingDistance('1111', '1111')).toBe(0);
    expect(hammingDistance('1010', '101')).toBe(Number.POSITIVE_INFINITY);
    expect(hammingDistance(null, '1010')).toBe(Number.POSITIVE_INFINITY);
  });

  test('image hashing returns null for remote-only upload metadata', async () => {
    const file = {
      key: 'uploads/remote-only.jpg',
      location: 'https://example-bucket.s3.amazonaws.com/uploads/remote-only.jpg',
    };

    expect(resolveHashInput(file)).toMatchObject({
      input: null,
      reason: 'remote-upload-unavailable',
    });
    await expect(computeImageHash(file)).resolves.toBeNull();
  });

  test('image hashing returns null for invalid image bytes', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      computeImageHash({ buffer: Buffer.from('not a real image') })
    ).resolves.toBeNull();

    warn.mockRestore();
  });
});
