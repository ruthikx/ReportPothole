const express = require('express');
const Ticket = require('../models/Ticket');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/summary', requireRole('admin'), async (req, res, next) => {
  try {
    const [total, byStatus, overdue] = await Promise.all([
      Ticket.countDocuments(),
      Ticket.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Ticket.countDocuments({
        status: { $ne: 'resolved' },
        slaDeadline: { $lt: new Date() },
      }),
    ]);

    const statusMap = {};
    byStatus.forEach((s) => {
      statusMap[s._id] = s.count;
    });

    res.json({
      total,
      open: statusMap.open || 0,
      assigned: statusMap.assigned || 0,
      inProgress: statusMap.in_progress || 0,
      resolved: statusMap.resolved || 0,
      overdue,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/by-ward', requireRole('admin'), async (req, res, next) => {
  try {
    const stats = await Ticket.aggregate([
      {
        $lookup: {
          from: 'wards',
          localField: 'ward',
          foreignField: '_id',
          as: 'wardInfo',
        },
      },
      { $unwind: { path: '$wardInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$wardInfo.name', 'Unassigned'] },
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          assigned: { $sum: { $cond: [{ $eq: ['$status', 'assigned'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
    ]);

    res.json({ wards: stats });
  } catch (err) {
    next(err);
  }
});

router.get('/heatmap', requireRole('admin'), async (req, res, next) => {
  try {
    const tickets = await Ticket.find(
      { status: { $ne: 'resolved' }, location: { $exists: true } },
      { location: 1, upvotes: 1, status: 1, reportId: 1 }
    ).lean();

    const features = tickets
      .filter((t) => t.location && t.location.coordinates)
      .map((t) => ({
        type: 'Feature',
        geometry: t.location,
        properties: {
          reportId: t.reportId,
          status: t.status,
          upvotes: t.upvotes,
        },
      }));

    res.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
