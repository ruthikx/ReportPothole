const express = require('express');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Ward = require('../models/Ward');
const { requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const { assignTicketSchema, updateStatusSchema } = require('../schemas/tickets');
const { dispatchNotification } = require('../services/notificationQueue');
const { computeImageHash } = require('../services/duplicateDetect');
const {
  cleanupTicketUploads,
  generatePresignedUrl,
  getStoredUploadKey,
} = require('../services/uploadStorage');
const {
  actorFromAuth,
  listTicketEvents,
  recordTicketEvent,
  serializeEvent,
} = require('../services/ticketEvents');

const router = express.Router();
const TICKET_STATUSES = ['open', 'assigned', 'in_progress', 'resolved'];

const buildPhotoUrls = async (photoKeys = []) => (
  await Promise.all(photoKeys.map((photo) => generatePresignedUrl(photo)))
).filter(Boolean);

const serializeAdminTicket = async (ticket) => {
  const beforePhotoUrls = await buildPhotoUrls(ticket.photos?.before || []);
  const afterPhotoUrls = await buildPhotoUrls(ticket.photos?.after || []);

  return {
    ...ticket,
    photoUrls: {
      before: beforePhotoUrls,
      after: afterPhotoUrls,
    },
    thumbnailUrl: beforePhotoUrls[0] || afterPhotoUrls[0] || null,
  };
};

const parseStatusFilter = (status) => {
  if (!status) return undefined;

  const values = (Array.isArray(status) ? status : String(status).split(','))
    .map((value) => String(value).trim())
    .filter(Boolean);
  const validValues = values.filter((value) => TICKET_STATUSES.includes(value));

  if (validValues.length === 0) return undefined;
  return validValues.length === 1 ? validValues[0] : { $in: validValues };
};

const canViewTicketHistory = (auth, ticket) => {
  if (auth.role === 'worker') {
    return ticket.assignedTo?.toString() === auth.sub;
  }

  return ['engineer', 'supervisor', 'commissioner', 'admin'].includes(auth.role);
};

const cleanupUploadedTicketFiles = async (files) => cleanupTicketUploads(Ticket, files);

router.get('/', requireRole('worker'), async (req, res, next) => {
  try {
    const filter = {};
    const statusFilter = parseStatusFilter(req.query.status);
    if (statusFilter) {
      filter.status = statusFilter;
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

    const serializedTickets = await Promise.all(tickets.map(serializeAdminTicket));

    res.json({
      tickets: serializedTickets,
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

    res.json({ tickets: await Promise.all(tickets.map(serializeAdminTicket)) });
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

router.get('/:id/history', requireRole('worker'), async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id).select('assignedTo').lean();

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (!canViewTicketHistory(req.auth, ticket)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const events = await listTicketEvents(ticket._id);
    res.json({ events: events.map(serializeEvent) });
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

    res.json(await serializeAdminTicket(ticket.toObject()));
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

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const previousAssignedTo = ticket.assignedTo;
    const previousStatus = ticket.status;

    ticket.assignedTo = workerId;
    ticket.status = 'assigned';
    await ticket.save();
    await ticket.populate('ward', 'name');

    await recordTicketEvent({
      ticketId: ticket._id,
      actor: actorFromAuth(req.auth),
      action: 'assigned',
      from: {
        assignedTo: previousAssignedTo ? previousAssignedTo.toString() : null,
        status: previousStatus,
      },
      to: {
        assignedTo: workerId,
        status: ticket.status,
      },
      note: `Assigned to ${worker.name}.`,
    });

    await dispatchNotification(worker, {
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
  async (req, res, next) => {
    const result = updateStatusSchema.safeParse(req.body);
    if (!result.success) {
      await cleanupUploadedTicketFiles(req.files || []);
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    req.body = result.data;
    next();
  },
  async (req, res, next) => {
    try {
      const { status } = req.body;

      const existingTicket = await Ticket.findById(req.params.id);
      if (!existingTicket) {
        await cleanupUploadedTicketFiles(req.files || []);
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const update = { status };
      if (req.files && req.files.length > 0) {
        update['photos.after'] = req.files.map((f) => getStoredUploadKey(f)).filter(Boolean);
        const afterHashes = (
          await Promise.all(req.files.map((file) => computeImageHash(file)))
        ).filter(Boolean);
        if (afterHashes.length > 0) {
          update['imageHashes.after'] = afterHashes;
        }
      }
      if (status === 'resolved') {
        update.resolvedAt = new Date();
      }

      const previousStatus = existingTicket.status;
      const previousResolvedAt = existingTicket.resolvedAt;

      Object.entries(update).forEach(([key, value]) => {
        existingTicket.set(key, value);
      });

      await existingTicket.save();

      const ticket = await Ticket.findById(existingTicket._id)
        .populate('ward', 'name')
        .populate('reportedBy', 'name email phone fcmToken');

      await recordTicketEvent({
        ticketId: ticket._id,
        actor: actorFromAuth(req.auth),
        action: status === 'resolved' ? 'resolved' : 'status_changed',
        from: {
          status: previousStatus,
          ...(previousResolvedAt ? { resolvedAt: previousResolvedAt } : {}),
        },
        to: {
          status: ticket.status,
          ...(ticket.resolvedAt ? { resolvedAt: ticket.resolvedAt } : {}),
        },
        note: status === 'resolved' ? 'Ticket resolved.' : `Status changed to ${status}.`,
      });

      if (status === 'resolved' && ticket.reportedBy) {
        await dispatchNotification(ticket.reportedBy, {
          title: `Resolved: ${ticket.reportId}`,
          body: 'Your pothole report has been marked resolved.',
          channels: ['fcm'],
        });
      }

      res.json(ticket);
    } catch (err) {
      await cleanupUploadedTicketFiles(req.files || []);
      next(err);
    }
  }
);

module.exports = router;
