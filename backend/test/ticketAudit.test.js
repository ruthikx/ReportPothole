const jwt = require('jsonwebtoken');
const request = require('supertest');
const sharp = require('sharp');
const { app } = require('../server');
const Ticket = require('../models/Ticket');
const TicketEvent = require('../models/TicketEvent');
const User = require('../models/User');
const { runEscalationJob } = require('../services/escalation');

const tokenFor = (user) => jwt.sign(
  { sub: user._id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const createUser = async (overrides = {}) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return User.create({
    name: overrides.name || `User ${unique}`,
    email: overrides.email || `user-${unique}@example.com`,
    phone: overrides.phone,
    role: overrides.role || 'citizen',
    wardName: overrides.wardName,
    passwordHash: overrides.password || 'password123',
  });
};

const createTicket = async (overrides = {}) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return Ticket.create({
    reportId: overrides.reportId || `RPT-${unique}`,
    location: {
      type: 'Point',
      coordinates: [77.5946, 12.9716],
    },
    address: overrides.address,
    photos: overrides.photos,
    description: overrides.description || 'Audit test ticket',
    status: overrides.status || 'open',
    assignedTo: overrides.assignedTo,
    upvotes: overrides.upvotes || 1,
    slaDeadline: overrides.slaDeadline || new Date(Date.now() + 60 * 60 * 1000),
    escalationLevel: overrides.escalationLevel || 0,
  });
};

const createImage = () => sharp({
  create: {
    width: 4,
    height: 4,
    channels: 3,
    background: '#379683',
  },
}).png().toBuffer();

describe('ticket audit history', () => {
  test('assignment writes an audit event and exposes protected history', async () => {
    const engineer = await createUser({ role: 'engineer', email: 'engineer-audit@example.com' });
    const worker = await createUser({ role: 'worker', email: 'worker-audit@example.com' });
    const ticket = await createTicket();

    await request(app)
      .patch(`/api/v1/tickets/${ticket._id}/assign`)
      .set('Authorization', `Bearer ${tokenFor(engineer)}`)
      .send({ workerId: String(worker._id) })
      .expect(200);

    const event = await TicketEvent.findOne({ ticketId: ticket._id, action: 'assigned' }).lean();
    expect(event).toMatchObject({
      action: 'assigned',
      actor: {
        type: 'user',
        role: 'engineer',
      },
      from: {
        assignedTo: null,
        status: 'open',
      },
      to: {
        assignedTo: String(worker._id),
        status: 'assigned',
      },
      note: `Assigned to ${worker.name}.`,
    });

    const history = await request(app)
      .get(`/api/v1/tickets/${ticket._id}/history`)
      .set('Authorization', `Bearer ${tokenFor(engineer)}`)
      .expect(200);

    expect(history.body.events).toHaveLength(1);
    expect(history.body.events[0]).toMatchObject({
      action: 'assigned',
      actor: {
        type: 'user',
        role: 'engineer',
        user: {
          name: engineer.name,
          email: engineer.email,
          role: 'engineer',
        },
      },
      note: `Assigned to ${worker.name}.`,
    });
  });

  test('assignment backfills ticket ward name from field worker when no geo ward exists', async () => {
    const engineer = await createUser({ role: 'engineer', email: 'engineer-ward-name@example.com' });
    const worker = await createUser({
      role: 'worker',
      email: 'worker-ward-name@example.com',
      wardName: 'Saraswathipuram',
    });
    const ticket = await createTicket({
      address: '10th Cross Road, Saraswathipuram, Tumakur, Karnataka',
    });

    await request(app)
      .patch(`/api/v1/tickets/${ticket._id}/assign`)
      .set('Authorization', `Bearer ${tokenFor(engineer)}`)
      .send({ workerId: String(worker._id) })
      .expect(200);

    const updatedTicket = await Ticket.findById(ticket._id).lean();
    expect(updatedTicket.ward).toBeUndefined();
    expect(updatedTicket.wardName).toBe('Saraswathipuram');

    const response = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenFor(engineer)}`)
      .expect(200);

    expect(response.body.tickets[0]).toMatchObject({
      reportId: ticket.reportId,
      wardName: 'Saraswathipuram',
      assignedTo: {
        name: worker.name,
      },
    });
  });

  test('status update writes an audit event', async () => {
    const worker = await createUser({ role: 'worker', email: 'status-worker@example.com' });
    const ticket = await createTicket({
      status: 'assigned',
      assignedTo: worker._id,
    });

    await request(app)
      .patch(`/api/v1/tickets/${ticket._id}/status`)
      .set('Authorization', `Bearer ${tokenFor(worker)}`)
      .send({ status: 'in_progress' })
      .expect(200);

    const event = await TicketEvent.findOne({ ticketId: ticket._id, action: 'status_changed' }).lean();
    expect(event).toMatchObject({
      action: 'status_changed',
      actor: {
        type: 'user',
        role: 'worker',
      },
      from: { status: 'assigned' },
      to: { status: 'in_progress' },
      note: 'Status changed to in_progress.',
    });
  });

  test('resolution after-photo is stored through the upload helper', async () => {
    const worker = await createUser({ role: 'worker', email: 'photo-worker@example.com' });
    const ticket = await createTicket({
      status: 'assigned',
      assignedTo: worker._id,
    });
    const image = await createImage();

    await request(app)
      .patch(`/api/v1/tickets/${ticket._id}/status`)
      .set('Authorization', `Bearer ${tokenFor(worker)}`)
      .field('status', 'resolved')
      .attach('afterPhoto', image, {
        filename: 'resolved.png',
        contentType: 'image/png',
      })
      .expect(200);

    const updatedTicket = await Ticket.findById(ticket._id).lean();
    expect(updatedTicket.photos.after).toHaveLength(1);
    expect(updatedTicket.photos.after[0]).toMatch(/^uploads\/.+\.png$/);
    expect(updatedTicket.imageHashes.after).toHaveLength(1);
  });

  test('ticket queue exposes address and thumbnail data for admin views', async () => {
    const engineer = await createUser({ role: 'engineer', email: 'queue-engineer@example.com' });
    const ticket = await createTicket({
      address: 'MG Road near Metro Gate 2',
      photos: { before: ['uploads/queue-photo.png'] },
    });

    const response = await request(app)
      .get('/api/v1/tickets')
      .set('Authorization', `Bearer ${tokenFor(engineer)}`)
      .expect(200);

    expect(response.body.tickets).toHaveLength(1);
    expect(response.body.tickets[0]).toMatchObject({
      reportId: ticket.reportId,
      address: 'MG Road near Metro Gate 2',
      thumbnailUrl: '/uploads/queue-photo.png',
      photoUrls: {
        before: ['/uploads/queue-photo.png'],
      },
    });
  });

  test('escalation job writes an audit event', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const ticket = await createTicket({
      slaDeadline: new Date(Date.now() - 60 * 60 * 1000),
      escalationLevel: 0,
    });

    await runEscalationJob();

    const event = await TicketEvent.findOne({ ticketId: ticket._id, action: 'escalated' }).lean();
    expect(event).toMatchObject({
      action: 'escalated',
      actor: {
        type: 'system',
        label: 'Escalation job',
      },
      from: { escalationLevel: 0 },
      to: { escalationLevel: 1 },
      note: 'Escalated to level 1.',
    });

    const updatedTicket = await Ticket.findById(ticket._id).lean();
    expect(updatedTicket.escalationLevel).toBe(1);

    console.log.mockRestore();
    console.error.mockRestore();
  });

  test('public report status exposes only public-safe history fields', async () => {
    const engineer = await createUser({ role: 'engineer', email: 'public-history-engineer@example.com' });
    const worker = await createUser({ role: 'worker', email: 'public-history-worker@example.com' });
    const ticket = await createTicket();

    await request(app)
      .patch(`/api/v1/tickets/${ticket._id}/assign`)
      .set('Authorization', `Bearer ${tokenFor(engineer)}`)
      .send({ workerId: String(worker._id) })
      .expect(200);

    const response = await request(app)
      .get(`/api/v1/reports/${ticket.reportId}`)
      .expect(200);

    expect(response.body.assignedTo).toBeUndefined();
    expect(response.body.reportedBy).toBeUndefined();
    expect(response.body.history).toHaveLength(1);
    expect(response.body.history[0]).toMatchObject({
      action: 'assigned',
      label: 'Assigned for repair',
      from: { status: 'open' },
      to: { status: 'assigned' },
    });
    expect(response.body.history[0].actor).toBeUndefined();
    expect(response.body.history[0].note).toBeUndefined();
    expect(response.body.history[0].to.assignedTo).toBeUndefined();
  });
});
