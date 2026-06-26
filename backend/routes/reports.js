const express = require('express');
const Ticket = require('../models/Ticket');
const Counter = require('../models/Counter');
const { requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { validate, sanitizeDescription } = require('../middleware/validate');
const { createReportSchema } = require('../schemas/reports');
const { findWardByPoint } = require('../services/geoRouter');
const { sendPushNotification } = require('../services/notifications');
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
  return req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
};

router.post(
  '/',
  requireRole('citizen'),
  upload.array('photos', 5),
  validate(createReportSchema),
  sanitizeDescription,
  async (req, res, next) => {
    try {
      const fingerprint = getDeviceFingerprint(req);
      const rateKey = `report_rate:${fingerprint}`;
      const currentCount = await redis.incr(rateKey);
      if (currentCount === 1) {
        await redis.pexpire(rateKey, RATE_LIMIT_WINDOW);
      }
      if (currentCount > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many reports. Limit is 5 per hour.' });
      }

      const { lat, lng, description } = req.body;

      const duplicate = await Ticket.findOne({
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: 50,
          },
        },
        status: { $ne: 'resolved' },
      });

      if (duplicate) {
        duplicate.upvotes += 1;
        await duplicate.save();

        return res.json({
          reportId: duplicate.reportId,
          isDuplicate: true,
          message: 'This pothole has already been reported. Your upvote has been counted.',
        });
      }

      const ward = await findWardByPoint(lng, lat);

      const beforePhotos = (req.files || []).map((f) => f.key);

      const slaHours = ward ? ward.slaHours : 168;
      const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

      const reportId = await generateReportId();

      const ticket = new Ticket({
        reportId,
        location: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        ward: ward ? ward._id : undefined,
        photos: { before: beforePhotos },
        description,
        status: 'open',
        reportedBy: req.auth.sub,
        upvotes: 1,
        slaDeadline,
        escalationLevel: 0,
      });
      await ticket.save();

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

router.post('/:id/upvote', requireRole('citizen'), async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
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
