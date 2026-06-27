const { serializePublicEvent } = require('./ticketEvents');

const serializePublicReport = (ticket, history = []) => ({
  id: ticket._id,
  _id: ticket._id,
  reportId: ticket.reportId,
  status: ticket.status,
  ward: ticket.ward
    ? {
        id: ticket.ward._id,
        name: ticket.ward.name,
      }
    : null,
  address: ticket.address,
  photos: ticket.photos,
  description: ticket.description,
  upvotes: ticket.upvotes,
  slaDeadline: ticket.slaDeadline,
  escalationLevel: ticket.escalationLevel,
  resolvedAt: ticket.resolvedAt,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
  history: history.map(serializePublicEvent),
});

module.exports = { serializePublicReport };
