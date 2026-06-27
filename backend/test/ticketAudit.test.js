const jwt = require('jsonwebtoken');
const request = require('supertest');
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
    description: 'Audit test ticket',
    status: overrides.status || 'open',
    assignedTo: overrides.assignedTo,
    upvotes: overrides.upvotes || 1,
    slaDeadline: overrides.slaDeadline || new Date(Date.now() + 60 * 60 * 1000),
    escalationLevel: overrides.escalationLevel || 0,
  });
};

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
