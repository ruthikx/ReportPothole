const Ward = require('../models/Ward');

const findWardByPoint = async (lng, lat) => {
  try {
    const ward = await Ward.findOne({
      boundary: {
        $geoIntersects: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
        },
      },
    });
    return ward;
  } catch (err) {
    console.error('[geoRouter] Error finding ward:', err);
    return null;
  }
};

module.exports = { findWardByPoint };
