const { z } = require('zod');

const assignTicketSchema = z.object({
  workerId: z.string().min(1, 'Worker ID is required'),
});

const updateStatusSchema = z.object({
  status: z.enum(['assigned', 'in_progress', 'resolved']),
});

const queryTicketsSchema = z.object({
  status: z.enum(['open', 'assigned', 'in_progress', 'resolved']).optional(),
  ward: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

module.exports = { assignTicketSchema, updateStatusSchema, queryTicketsSchema };
