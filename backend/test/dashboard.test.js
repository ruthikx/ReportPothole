const request = require('supertest');
const { app } = require('../server');
const Ticket = require('../models/Ticket');

describe('dashboard routes', () => {
  test('GET /api/v1/dashboard/stats is reachable with an empty database', async () => {
    const response = await request(app)
      .get('/api/v1/dashboard/stats')
      .expect(200);

    expect(response.body).toMatchObject({
      totalReports: 0,
      totalReportsThisMonth: 0,
      resolved: 0,
      pending: 0,
      open: 0,
      assigned: 0,
      inProgress: 0,
      overdue: 0,
      resolutionRate: 0,
      averageFixTimeDays: 0,
    });
  });

  test('GET /api/v1/dashboard/heatmap includes address and image data', async () => {
    await Ticket.create({
      reportId: 'RPT-DASH-IMAGE',
      location: {
        type: 'Point',
        coordinates: [77.5946, 12.9716],
      },
      address: 'MG Road near Metro Gate 2',
      description: 'Large pothole in left lane',
      photos: { before: ['uploads/dashboard-before.png'] },
      status: 'open',
      upvotes: 4,
    });

    const response = await request(app)
      .get('/api/v1/dashboard/heatmap')
      .expect(200);

    expect(response.body.features).toHaveLength(1);
    expect(response.body.features[0].properties).toMatchObject({
      reportId: 'RPT-DASH-IMAGE',
      address: 'MG Road near Metro Gate 2',
      description: 'Large pothole in left lane',
      locationName: 'MG Road near Metro Gate 2',
      thumbnailUrl: '/uploads/dashboard-before.png',
      photoUrls: {
        before: ['/uploads/dashboard-before.png'],
        after: [],
      },
    });
  });
});
