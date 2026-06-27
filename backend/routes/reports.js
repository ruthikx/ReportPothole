const express = require('express');
const Ticket = require('../models/Ticket');
const Counter = require('../models/Counter');
const { optionalAuth, requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { validate, sanitizeDescription } = require('../middleware/validate');
const { createReportSchema } = require('../schemas/reports');
const { findWardByPoint } = require('../services/geoRouter');
const { sendPushNotification } = require('../services/notifications');
const { findDuplicate } = require('../services/duplicateDetect');
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

router.post(
  '/',
  optionalAuth,
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'photos', maxCount: 5 },
  ]),
  validate(createReportSchema),
  sanitizeDescription,
  async (req, res, next) => {
    try {
      const fingerprint = getDeviceFingerprint(req);
      const allowed = await enforceReportRateLimit(fingerprint);
      if (!allowed) {
        return res.status(429).json({ error: 'Too many reports. Limit is 5 per hour.' });
      }

      const { lat, lng, description, address, deviceId, fcmToken } = req.body;
      const uploaded = [
        ...(req.files?.photo || []),
        ...(req.files?.photos || []),
      ];

      if (uploaded.length === 0) {
        return res.status(400).json({ error: 'A pothole photo is required' });
      }

      const longitude = Number(lng);
      const latitude = Number(lat);
      const duplicate = await findDuplicate(longitude, latitude);

      if (duplicate) {
        duplicate.upvotes += 1;
        await duplicate.save();

        return res.json({
          reportId: duplicate.reportId,
          isDuplicate: true,
          upvotes: duplicate.upvotes,
          message: 'This pothole has already been reported. Your upvote has been counted.',
        });
      }

      const ward = await findWardByPoint(longitude, latitude);
      const beforePhotos = uploaded.map((f) => f.key || f.path || f.filename);

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
        address,
        photos: { before: beforePhotos },
        description,
        status: 'open',
        reportedBy: req.auth?.sub,
        upvotes: 1,
        slaDeadline,
        escalationLevel: 0,
      });
      await ticket.save();

      if (req.auth?.sub && (deviceId || fcmToken)) {
        await User.findByIdAndUpdate(req.auth.sub, {
          ...(deviceId ? { deviceId } : {}),
          ...(fcmToken ? { fcmToken } : {}),
        });
      }

      if (ward && ward.assignedEngineer) {
        const engineer = await User.findById(ward.assignedEngineer);
        if (engineer && engineer.fcmToken) {
          await sendPushNotification(
            engineer.fcmToken,
            `New Pothole Report: ${reportId}`,
            `A new pothole has been reported in ${ward.name}. Please investigate.`,
            { ticketId: ticket._id.toString(), reportId }
          );
        }
      }

      res.status(201).json({
        reportId,
        ticketId: ticket._id,
        isDuplicate: false,
        ward: ward ? ward.name : null,
        slaDeadline,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:reportId', async (req, res, next) => {
  try {
    const ticket = await Ticket.findOne({ reportId: req.params.reportId })
      .populate('ward', 'name')
      .populate('assignedTo', 'name')
      .populate('reportedBy', 'name');

    if (!ticket) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(ticket);
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

    res.json({ upvotes: ticket.upvotes });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
