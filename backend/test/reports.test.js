const fs = require('fs');
const path = require('path');
const request = require('supertest');
const sharp = require('sharp');
const { app } = require('../server');
const Ticket = require('../models/Ticket');

const testUploadPath = path.join(
  __dirname,
  '..',
  'uploads',
  '00000000-0000-4000-8000-000000000000.png'
);
const testUploadJpegPath = path.join(
  __dirname,
  '..',
  'uploads',
  '00000000-0000-4000-8000-000000000000.jpg'
);

const createImage = (color = '#d33', format = 'png') => {
  const image = sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: color,
    },
  });

  return format === 'jpeg'
    ? image.jpeg().toBuffer()
    : image.png().toBuffer();
};

const postReport = async ({
  lat,
  lng,
  color = '#d33',
  deviceId = 'test-device',
  format = 'png',
  expectedStatus = 201,
}) => {
  const image = await createImage(color, format);
  const extension = format === 'jpeg' ? 'jpg' : 'png';
  const contentType = format === 'jpeg' ? 'image/jpeg' : 'image/png';

  return request(app)
    .post('/api/v1/reports')
    .field('lat', String(lat))
    .field('lng', String(lng))
    .field('description', 'Reported from test')
    .field('deviceId', deviceId)
    .attach('photo', image, {
      filename: `${deviceId}.${extension}`,
      contentType,
    })
    .expect(expectedStatus);
};

describe('report duplicate detection', () => {
  beforeAll(async () => {
    await Ticket.syncIndexes();
  });

  afterEach(() => {
    fs.rmSync(testUploadPath, { force: true });
    fs.rmSync(testUploadJpegPath, { force: true });
  });

  test('GPS duplicate within 50m increments upvotes and returns duplicate response', async () => {
    const first = await postReport({
      lat: 12.9716,
      lng: 77.5946,
      deviceId: 'near-first',
    });

    expect(first.body).toMatchObject({
      isDuplicate: false,
      ward: null,
    });
    expect(first.body.reportId).toBeDefined();
    expect(first.body.ticketId).toBeDefined();

    const duplicate = await postReport({
      lat: 12.97165,
      lng: 77.59465,
      format: 'jpeg',
      deviceId: 'near-second',
      expectedStatus: 200,
    });

    expect(duplicate.body).toEqual({
      reportId: first.body.reportId,
      isDuplicate: true,
      upvotes: 2,
      message: 'This pothole has already been reported. Your upvote has been counted.',
    });

    const tickets = await Ticket.find({}).lean();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].upvotes).toBe(2);
    expect(fs.existsSync(testUploadPath)).toBe(true);
    expect(fs.existsSync(testUploadJpegPath)).toBe(false);
  });

  test('reports outside duplicate radius create separate tickets', async () => {
    const first = await postReport({
      lat: 12.9716,
      lng: 77.5946,
      deviceId: 'far-first',
    });

    const second = await postReport({
      lat: 12.9726,
      lng: 77.5956,
      color: '#3a6fd8',
      deviceId: 'far-second',
    });

    expect(second.body).toMatchObject({
      isDuplicate: false,
      ward: null,
    });
    expect(second.body.reportId).toBeDefined();
    expect(second.body.reportId).not.toBe(first.body.reportId);

    const tickets = await Ticket.find({}).sort({ reportId: 1 }).lean();
    expect(tickets).toHaveLength(2);
    expect(tickets.map((ticket) => ticket.upvotes)).toEqual([1, 1]);
  });

  test('failed ticket creation removes unused local uploads', async () => {
    const saveSpy = jest
      .spyOn(Ticket.prototype, 'save')
      .mockRejectedValueOnce(new Error('simulated ticket save failure'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await postReport({
        lat: 12.9816,
        lng: 77.6046,
        format: 'jpeg',
        deviceId: 'save-failure',
        expectedStatus: 500,
      });

      expect(fs.existsSync(testUploadJpegPath)).toBe(false);
      await expect(Ticket.find({})).resolves.toHaveLength(0);
    } finally {
      saveSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
