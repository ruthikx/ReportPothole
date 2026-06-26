const mongoose = require('mongoose');

const wardSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    boundary: {
      type: {
        type: String,
        enum: ['Polygon'],
        required: true,
      },
      coordinates: {
        type: [[[Number]]],
        required: true,
      },
    },
    assignedEngineer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    slaHours: {
      type: Number,
      default: 168,
    },
  },
  {
    timestamps: true,
  }
);

wardSchema.index({ boundary: '2dsphere' });

module.exports = mongoose.model('Ward', wardSchema);
