const request = require('supertest');
const { app } = require('../server');

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
});
