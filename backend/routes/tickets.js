const express = require('express');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Ward = require('../models/Ward');
const { requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const { assignTicketSchema, updateStatusSchema } = require('../schemas/tickets');
const { notify } = require('../services/notifications');

const router = express.Router();

router.get('/', requireRole('worker'), async (req, res, next) => {
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

router.get('/overdue', requireRole('supervisor'), async (req, res, next) => {
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

router.get('/meta/workers', requireRole('engineer'), async (req, res, next) => {
  try {
    const filter = { role: 'worker' };
    if (req.query.ward) {
      filter.ward = req.query.ward;
    }

    const workers = await User.find(filter)
      .select('name email phone ward')
      .populate('ward', 'name')
      .sort({ name: 1 })
      .lean();

    res.json({ workers });
  } catch (err) {
    next(err);
  }
});

router.get('/meta/wards', requireRole('engineer'), async (req, res, next) => {
  try {
    const wards = await Ward.find({})
      .select('name slaHours assignedEngineer')
      .populate('assignedEngineer', 'name email phone')
      .sort({ name: 1 })
      .lean();

    res.json({ wards });
  } catch (err) {
    next(err);
  }
});

router.get('/meta/users', requireRole('supervisor'), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.role) {
      filter.role = req.query.role;
    }
    if (req.query.ward) {
      filter.ward = req.query.ward;
    }

    const users = await User.find(filter)
      .select('name email phone role ward createdAt')
      .populate('ward', 'name')
      .sort({ role: 1, name: 1 })
      .limit(200)
      .lean();

    res.json({ users });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireRole('worker'), async (req, res, next) => {
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

router.patch('/:id/assign', requireRole('engineer'), validate(assignTicketSchema), async (req, res, next) => {
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

    await notify(worker, {
      title: `Assigned: ${ticket.reportId}`,
      body: `A pothole repair ticket has been assigned${ticket.ward ? ` in ${ticket.ward.name}` : ''}.`,
      channels: ['fcm', 'sms'],
    });

    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/status',
  requireRole('worker'),
  upload.array('afterPhoto', 1),
  (req, res, next) => {
    if (!req.body.status && req.query.status) {
      req.body.status = req.query.status;
    }
    next();
  },
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
      })
        .populate('ward', 'name')
        .populate('reportedBy', 'name email phone fcmToken');

      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      if (status === 'resolved' && ticket.reportedBy) {
        await notify(ticket.reportedBy, {
          title: `Resolved: ${ticket.reportId}`,
          body: 'Your pothole report has been marked resolved.',
          channels: ['fcm'],
        });
      }

      res.json(ticket);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
