const Ticket = require('../models/Ticket');

const findDuplicate = async (lng, lat, radiusMetres = 50) => {
  return Ticket.findOne({
    status: { $ne: 'resolved' },
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        $maxDistance: radiusMetres,
      },
    },
  }).sort({ createdAt: -1 });
};

module.exports = { findDuplicate };
