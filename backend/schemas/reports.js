const { z } = require('zod');

const createReportSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  description: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
  deviceId: z.string().max(200).optional(),
  fcmToken: z.string().max(500).optional(),
});

const upvoteSchema = z.object({});

module.exports = { createReportSchema, upvoteSchema };
