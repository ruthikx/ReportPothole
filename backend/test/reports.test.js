const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const sharp = require('sharp');
const { app } = require('../server');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

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
  address,
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
    .field('address', address || '')
    .attach('photo', image, {
      filename: `${deviceId}.${extension}`,
      contentType,
    })
    .expect(expectedStatus);
};

const tokenFor = (user) => jwt.sign(
  { sub: user._id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const createUser = async (overrides = {}) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return User.create({
    name: overrides.name || `Citizen ${unique}`,
    email: overrides.email || `citizen-${unique}@example.com`,
    role: overrides.role || 'citizen',
    passwordHash: overrides.password || 'password123',
  });
};

const createTicket = async (overrides = {}) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return Ticket.create({
    reportId: overrides.reportId || `RPT-${unique}`,
    location: {
      type: 'Point',
      coordinates: overrides.coordinates || [77.5946, 12.9716],
    },
    address: overrides.address,
    photos: overrides.photos || { before: ['uploads/00000000-0000-4000-8000-000000000000.png'] },
    description: overrides.description || 'Reported from test',
    status: overrides.status || 'open',
    reportedBy: overrides.reportedBy,
    upvotes: overrides.upvotes || 1,
    slaDeadline: overrides.slaDeadline || new Date(Date.now() + 60 * 60 * 1000),
    escalationLevel: overrides.escalationLevel || 0,
  });
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
      address: 'MG Road, Central Area',
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
    expect(tickets[0].address).toBe('MG Road, Central Area');
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

  test('public report feed returns report cards with location and thumbnail data', async () => {
    const older = await createTicket({
      reportId: 'RPT-OLDER',
      coordinates: [72.5714, 23.0225],
      address: 'Old City Road',
      description: 'Deep pothole near the bus stop',
      upvotes: 4,
    });
    const newer = await createTicket({
      reportId: 'RPT-NEWER',
      coordinates: [72.5800, 23.0300],
      address: 'Ring Road',
      description: 'Fresh report',
      upvotes: 2,
    });

    const response = await request(app)
      .get('/api/v1/reports')
      .expect(200);

    expect(response.body.pagination.total).toBe(2);
    expect(response.body.reports.map((report) => report.reportId)).toEqual([
      newer.reportId,
      older.reportId,
    ]);
    expect(response.body.reports[0]).toMatchObject({
      reportId: newer.reportId,
      trackingId: newer.reportId,
      statusLabel: 'Pending',
      locationName: 'Ring Road',
      location: {
        latitude: 23.03,
        longitude: 72.58,
      },
      thumbnailUrl: '/uploads/00000000-0000-4000-8000-000000000000.png',
      upvotes: 2,
    });
  });

  test('authenticated profile feed only returns reports submitted by the user', async () => {
    const citizen = await createUser({ email: 'mine@example.com' });
    const other = await createUser({ email: 'other@example.com' });
    const mine = await createTicket({
      reportId: 'RPT-MINE',
      reportedBy: citizen._id,
      status: 'in_progress',
    });
    await createTicket({
      reportId: 'RPT-OTHER',
      reportedBy: other._id,
    });

    const response = await request(app)
      .get('/api/v1/reports/mine')
      .set('Authorization', `Bearer ${tokenFor(citizen)}`)
      .expect(200);

    expect(response.body.reports).toHaveLength(1);
    expect(response.body.reports[0]).toMatchObject({
      reportId: mine.reportId,
      status: 'in_progress',
      statusLabel: 'In Review',
    });
  });

  test('upvote endpoint updates community feed counts', async () => {
    const ticket = await createTicket({
      reportId: 'RPT-UPVOTE',
      upvotes: 1,
    });

    await request(app)
      .post(`/api/v1/reports/${ticket.reportId}/upvote`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.upvotes).toBe(2);
      });

    const response = await request(app)
      .get('/api/v1/reports')
      .expect(200);

    expect(response.body.reports[0]).toMatchObject({
      reportId: ticket.reportId,
      upvotes: 2,
    });
  });
});
