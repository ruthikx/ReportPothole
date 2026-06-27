const mongoose = require('mongoose');

const actorSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['public', 'user', 'system'],
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    role: {
      type: String,
      trim: true,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 120,
    },
  },
  { _id: false }
);

const ticketEventSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true,
      index: true,
    },
    actor: {
      type: actorSchema,
      required: true,
      default: () => ({ type: 'system' }),
    },
    action: {
      type: String,
      enum: [
        'report_created',
        'duplicate_upvote',
        'assigned',
        'status_changed',
        'resolved',
        'escalated',
      ],
      required: true,
      index: true,
    },
    from: {
      type: mongoose.Schema.Types.Mixed,
    },
    to: {
      type: mongoose.Schema.Types.Mixed,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

ticketEventSchema.index({ ticketId: 1, createdAt: 1 });

module.exports = mongoose.model('TicketEvent', ticketEventSchema);
