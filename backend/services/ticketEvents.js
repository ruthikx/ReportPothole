const TicketEvent = require('../models/TicketEvent');

const PUBLIC_ACTION_LABELS = {
  report_created: 'Report created',
  duplicate_upvote: 'Duplicate report counted',
  assigned: 'Assigned for repair',
  status_changed: 'Status updated',
  resolved: 'Resolved',
  escalated: 'Escalated for review',
};

const PUBLIC_VALUE_FIELDS = ['status', 'upvotes', 'escalationLevel', 'resolvedAt'];

const actorFromAuth = (auth) => {
  if (!auth?.sub) {
    return { type: 'public', label: 'Public reporter' };
  }

  return {
    type: 'user',
    user: auth.sub,
    role: auth.role,
  };
};

const systemActor = (label = 'System') => ({
  type: 'system',
  label,
});

const recordTicketEvent = async ({
  ticketId,
  actor = systemActor(),
  action,
  from,
  to,
  note,
}) => {
  return TicketEvent.create({
    ticketId,
    actor,
    action,
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    ...(note ? { note } : {}),
  });
};

const listTicketEvents = async (ticketId) => {
  return TicketEvent.find({ ticketId })
    .populate('actor.user', 'name email role')
    .sort({ createdAt: 1, _id: 1 })
    .lean();
};

const serializeEvent = (event) => ({
  id: event._id,
  ticketId: event.ticketId,
  action: event.action,
  actor: {
    type: event.actor?.type,
    user: event.actor?.user
      ? {
          id: event.actor.user._id || event.actor.user.id,
          name: event.actor.user.name,
          email: event.actor.user.email,
          role: event.actor.user.role,
        }
      : undefined,
    role: event.actor?.role,
    label: event.actor?.label,
  },
  from: event.from,
  to: event.to,
  note: event.note,
  createdAt: event.createdAt,
});

const serializePublicValue = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  return PUBLIC_VALUE_FIELDS.reduce((safe, field) => {
    if (value[field] !== undefined) {
      safe[field] = value[field];
    }
    return safe;
  }, {});
};

const serializePublicEvent = (event) => ({
  action: event.action,
  label: PUBLIC_ACTION_LABELS[event.action] || 'Ticket updated',
  from: serializePublicValue(event.from),
  to: serializePublicValue(event.to),
  createdAt: event.createdAt,
});

module.exports = {
  actorFromAuth,
  listTicketEvents,
  recordTicketEvent,
  serializeEvent,
  serializePublicEvent,
  systemActor,
};
