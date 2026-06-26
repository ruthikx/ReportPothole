const express = require('express');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const { assignTicketSchema, updateStatusSchema } = require('../schemas/tickets');

const router = express.Router();

router.get('/', requireRole('worker', 'admin'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.ward) {
      filter.ward = req.query.ward;
    }

    if (req.auth.role === 'worker') {
      filter.assignedTo = req.auth.sub;
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .populate('ward', 'name')
        .populate('assignedTo', 'name')
        .sort({ slaDeadline: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Ticket.countDocuments(filter),
    ]);

    res.json({
      tickets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/overdue', requireRole('admin'), async (req, res, next) => {
  try {
    const tickets = await Ticket.find({
      status: { $ne: 'resolved' },
      slaDeadline: { $lt: new Date() },
    })
      .populate('ward', 'name')
      .populate('assignedTo', 'name')
      .sort({ slaDeadline: 1 })
      .lean();

    res.json({ tickets });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireRole('worker', 'admin'), async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('ward', 'name')
      .populate('assignedTo', 'name')
      .populate('reportedBy', 'name');

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/assign', requireRole('admin'), validate(assignTicketSchema), async (req, res, next) => {
  try {
    const { workerId } = req.body;

    const worker = await User.findOne({ _id: workerId, role: 'worker' });
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      {
        assignedTo: workerId,
        status: 'assigned',
      },
      { new: true }
    ).populate('ward', 'name');

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/status',
  requireRole('worker', 'admin'),
  upload.array('afterPhoto', 1),
  validate(updateStatusSchema),
  async (req, res, next) => {
    try {
      const { status } = req.body;

      const update = { status };
      if (req.files && req.files.length > 0) {
        update['photos.after'] = req.files.map((f) => f.key);
      }
      if (status === 'resolved') {
        update.resolvedAt = new Date();
      }

      const ticket = await Ticket.findByIdAndUpdate(req.params.id, update, {
        new: true,
      }).populate('ward', 'name');

      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      res.json(ticket);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
