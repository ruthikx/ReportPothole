const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    ward: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ward',
    },
    photos: {
      before: [{ type: String }],
      after: [{ type: String }],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ['open', 'assigned', 'in_progress', 'resolved'],
      default: 'open',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    duplicateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
    },
    upvotes: {
      type: Number,
      default: 0,
    },
    slaDeadline: {
      type: Date,
    },
    escalationLevel: {
      type: Number,
      min: 0,
      max: 3,
      default: 0,
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

ticketSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Ticket', ticketSchema);
