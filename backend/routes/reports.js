const express = require('express');
const Ticket = require('../models/Ticket');
const Counter = require('../models/Counter');
const { optionalAuth, requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { sanitizeDescription } = require('../middleware/validate');
const { createReportSchema } = require('../schemas/reports');
const { findWardByPoint } = require('../services/geoRouter');
const { dispatchNotification } = require('../services/notificationQueue');
const { computeImageHash, findDuplicate } = require('../services/duplicateDetect');
const {
  cleanupTicketUploads,
  getStoredUploadKey,
} = require('../services/uploadStorage');
const {
  actorFromAuth,
  listTicketEvents,
  recordTicketEvent,
} = require('../services/ticketEvents');
const { serializePublicReport } = require('../services/publicReports');
const { inferWardName } = require('../services/wardNames');
const redis = require('../config/redis');
const User = require('../models/User');

const router = express.Router();

const generateReportId = async () => {
  const counter = await Counter.findByIdAndUpdate(
    'reportId',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter.seq).padStart(5, '0');
  return `RPT-${seq}`;
};

const RATE_LIMIT_WINDOW = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

const getDeviceFingerprint = (req) => {
  return req.body.deviceId || req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
};

const enforceReportRateLimit = async (fingerprint) => {
  if (!redis || redis.status === 'end') return true;

  try {
    const rateKey = `report_rate:${fingerprint}`;
    const currentCount = await redis.incr(rateKey);
    if (currentCount === 1) {
      await redis.pexpire(rateKey, RATE_LIMIT_WINDOW);
    }
    return currentCount <= RATE_LIMIT_MAX;
  } catch (err) {
    console.warn('[Reports] Redis rate limit skipped:', err.message);
    return true;
  }
};

const getUploadedReportFiles = (req) => [
  ...(req.files?.photo || []),
  ...(req.files?.photos || []),
];

const cleanupUploadedReportFiles = async (files) => cleanupTicketUploads(Ticket, files);

const validateReportBody = async (req, res, next) => {
  const result = createReportSchema.safeParse(req.body);
  if (!result.success) {
    await cleanupUploadedReportFiles(getUploadedReportFiles(req));
    const errors = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  req.body = result.data;
  next();
};

router.post(
  '/',
  optionalAuth,
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'photos', maxCount: 5 },
  ]),
  validateReportBody,
  sanitizeDescription,
  async (req, res, next) => {
    try {
      const uploaded = getUploadedReportFiles(req);
      const fingerprint = getDeviceFingerprint(req);
      const allowed = await enforceReportRateLimit(fingerprint);
      if (!allowed) {
        await cleanupUploadedReportFiles(uploaded);
        return res.status(429).json({ error: 'Too many reports. Limit is 5 per hour.' });
      }

      const { lat, lng, description, address, deviceId, fcmToken } = req.body;

      if (uploaded.length === 0) {
        return res.status(400).json({ error: 'A pothole photo is required' });
      }

      const longitude = Number(lng);
      const latitude = Number(lat);
      const firstImageHash = await computeImageHash(uploaded[0]);
      const duplicate = await findDuplicate(longitude, latitude, {
        imageHash: firstImageHash,
      });

      if (duplicate) {
        const previousUpvotes = duplicate.upvotes;
        duplicate.upvotes += 1;
        if (!duplicate.address && address) {
          duplicate.address = address;
        }
        await duplicate.save();
        await recordTicketEvent({
          ticketId: duplicate._id,
          actor: actorFromAuth(req.auth),
          action: 'duplicate_upvote',
          from: { upvotes: previousUpvotes },
          to: { upvotes: duplicate.upvotes },
          note: 'Duplicate report upvote counted.',
        });

        await cleanupUploadedReportFiles(uploaded);

        return res.json({
          reportId: duplicate.reportId,
          isDuplicate: true,
          upvotes: duplicate.upvotes,
          message: 'This pothole has already been reported. Your upvote has been counted.',
        });
      }

      const ward = await findWardByPoint(longitude, latitude);
      const wardName = ward?.name || inferWardName(address, description);
      const beforePhotos = uploaded.map((f) => getStoredUploadKey(f)).filter(Boolean);
      const beforeHashes = (
        await Promise.all(uploaded.map((file) => computeImageHash(file)))
      ).filter(Boolean);

      const slaHours = ward ? ward.slaHours : 168;
      const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

      const reportId = await generateReportId();

      const ticket = new Ticket({
        reportId,
        location: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        ward: ward ? ward._id : undefined,
        wardName,
        address,
        photos: { before: beforePhotos },
        imageHashes: { before: beforeHashes },
        description,
        status: 'open',
        reportedBy: req.auth?.sub,
        upvotes: 1,
        slaDeadline,
        escalationLevel: 0,
      });
      await ticket.save();
      await recordTicketEvent({
        ticketId: ticket._id,
        actor: actorFromAuth(req.auth),
        action: 'report_created',
        to: { status: ticket.status, upvotes: ticket.upvotes },
        note: 'Report created.',
      });

      if (req.auth?.sub && (deviceId || fcmToken)) {
        await User.findByIdAndUpdate(req.auth.sub, {
          ...(deviceId ? { deviceId } : {}),
          ...(fcmToken ? { fcmToken } : {}),
        });
      }

      if (ward && ward.assignedEngineer) {
        const engineer = await User.findById(ward.assignedEngineer);
        if (engineer) {
          await dispatchNotification(engineer, {
            title: `New Pothole Report: ${reportId}`,
            body: `A new pothole has been reported in ${wardName || ward.name}. Please investigate.`,
            channels: ['fcm'],
            data: { ticketId: ticket._id.toString(), reportId },
          });
        }
      }

      res.status(201).json({
        reportId,
        ticketId: ticket._id,
        isDuplicate: false,
        ward: wardName || null,
        slaDeadline,
      });
    } catch (err) {
      await cleanupUploadedReportFiles(getUploadedReportFiles(req));
      next(err);
    }
  }
);

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.mine === 'true') {
      if (!req.auth?.sub) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      filter.reportedBy = req.auth.sub;
    }
    if (req.query.status) {
      const statuses = String(req.query.status)
        .split(',')
        .map((status) => status.trim())
        .filter(Boolean);
      if (statuses.length === 1) {
        filter.status = statuses[0];
      } else if (statuses.length > 1) {
        filter.status = { $in: statuses };
      }
    }

    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .populate('ward', 'name')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Ticket.countDocuments(filter),
    ]);

    const reports = await Promise.all(
      tickets.map((ticket) => serializePublicReport(ticket))
    );

    res.json({
      reports,
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

router.get('/mine', requireRole('citizen'), async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const skip = (page - 1) * limit;

    const [tickets, total] = await Promise.all([
      Ticket.find({ reportedBy: req.auth.sub })
        .populate('ward', 'name')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Ticket.countDocuments({ reportedBy: req.auth.sub }),
    ]);

    const reports = await Promise.all(
      tickets.map((ticket) => serializePublicReport(ticket))
    );

    res.json({
      reports,
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

router.get('/:reportId', async (req, res, next) => {
  try {
    const ticket = await Ticket.findOne({ reportId: req.params.reportId })
      .populate('ward', 'name')
      .lean();

    if (!ticket) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const history = await listTicketEvents(ticket._id);

    res.json(await serializePublicReport(ticket, history));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/upvote', optionalAuth, async (req, res, next) => {
  try {
    const lookup = req.params.id.match(/^[a-f\d]{24}$/i)
      ? { _id: req.params.id }
      : { reportId: req.params.id };
    const ticket = await Ticket.findOne(lookup);
    if (!ticket) {
      return res.status(404).json({ error: 'Report not found' });
    }

    ticket.upvotes += 1;
    await ticket.save();
    await recordTicketEvent({
      ticketId: ticket._id,
      actor: actorFromAuth(req.auth),
      action: 'duplicate_upvote',
      from: { upvotes: ticket.upvotes - 1 },
      to: { upvotes: ticket.upvotes },
      note: 'Duplicate report upvote counted.',
    });

    res.json({ upvotes: ticket.upvotes });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
