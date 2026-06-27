const express = require('express');
const Ticket = require('../models/Ticket');
const { listTicketEvents } = require('../services/ticketEvents');
const { serializePublicReport } = require('../services/publicReports');

const router = express.Router();

const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

router.get('/stats', async (req, res, next) => {
  try {
    const monthStart = startOfMonth();
    const [totalReports, monthlyReports, byStatus, overdue, fixTimes] = await Promise.all([
      Ticket.countDocuments(),
      Ticket.countDocuments({ createdAt: { $gte: monthStart } }),
      Ticket.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Ticket.countDocuments({
        status: { $ne: 'resolved' },
        slaDeadline: { $lt: new Date() },
      }),
      Ticket.aggregate([
        {
          $match: {
            status: 'resolved',
            resolvedAt: { $exists: true },
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $project: {
            fixTimeDays: {
              $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 1000 * 60 * 60 * 24],
            },
          },
        },
        { $group: { _id: null, averageFixTimeDays: { $avg: '$fixTimeDays' } } },
      ]),
    ]);

    const statusMap = byStatus.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});
    const resolved = statusMap.resolved || 0;
    const pending = totalReports - resolved;

    res.json({
      totalReports,
      totalReportsThisMonth: monthlyReports,
      resolved,
      pending,
      open: statusMap.open || 0,
      assigned: statusMap.assigned || 0,
      inProgress: statusMap.in_progress || 0,
      overdue,
      resolutionRate: totalReports ? Math.round((resolved / totalReports) * 100) : 0,
      averageFixTimeDays: Number((fixTimes[0]?.averageFixTimeDays || 0).toFixed(1)),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/heatmap', async (req, res, next) => {
  try {
    const tickets = await Ticket.find(
      { status: { $ne: 'resolved' }, location: { $exists: true } },
      { location: 1, upvotes: 1, status: 1, reportId: 1, escalationLevel: 1, ward: 1 }
    )
      .populate('ward', 'name')
      .lean();

    res.json({
      type: 'FeatureCollection',
      features: tickets
        .filter((ticket) => ticket.location?.coordinates?.length === 2)
        .map((ticket) => ({
          type: 'Feature',
          geometry: ticket.location,
          properties: {
            id: ticket._id,
            reportId: ticket.reportId,
            status: ticket.status,
            upvotes: ticket.upvotes,
            escalationLevel: ticket.escalationLevel,
            ward: ticket.ward?.name || 'Unassigned',
          },
        })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/wards', async (req, res, next) => {
  try {
    const wards = await Ticket.aggregate([
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
      {
        $addFields: {
          pending: { $subtract: ['$total', '$resolved'] },
          resolutionRate: {
            $cond: [
              { $gt: ['$total', 0] },
              { $round: [{ $multiply: [{ $divide: ['$resolved', '$total'] }, 100] }, 0] },
              0,
            ],
          },
        },
      },
      { $sort: { resolutionRate: 1, pending: -1, total: -1 } },
    ]);

    res.json({ wards });
  } catch (err) {
    next(err);
  }
});

router.get('/status/:reportId', async (req, res, next) => {
  try {
    const ticket = await Ticket.findOne({ reportId: req.params.reportId })
      .populate('ward', 'name')
      .lean();

    if (!ticket) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const history = await listTicketEvents(ticket._id);

    res.json(serializePublicReport(ticket, history));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
