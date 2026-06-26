const { z } = require('zod');

const createReportSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  description: z.string().max(2000).optional(),
});

const upvoteSchema = z.object({});

module.exports = { createReportSchema, upvoteSchema };
