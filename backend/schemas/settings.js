const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');

const staffRoleSchema = z.enum([
  'engineer',
  'supervisor',
  'commissioner',
  'admin',
]);

const coordinatePairSchema = z.tuple([
  z.coerce.number().min(-180).max(180),
  z.coerce.number().min(-90).max(90),
]);

const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(coordinatePairSchema).min(4)).min(1),
}).refine((polygon) => polygon.coordinates.every((ring) => {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}), {
  message: 'Polygon rings must be closed',
});

const createWardSchema = z.object({
  name: z.string().min(1).max(120),
  slaHours: z.coerce.number().int().positive().max(2160).default(168),
  assignedEngineer: z.union([objectId, z.literal('')]).optional(),
  boundary: polygonSchema,
});

const updateWardSchema = createWardSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

const listUsersQuerySchema = z.object({
  role: staffRoleSchema.optional(),
  ward: objectId.optional(),
});

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().toLowerCase(),
  phone: z.string().max(40).optional(),
  role: staffRoleSchema,
  ward: z.union([objectId, z.literal('')]).optional(),
  password: z.string().min(8).max(128),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().toLowerCase().optional(),
  phone: z.string().max(40).optional(),
  role: staffRoleSchema.optional(),
  ward: z.union([objectId, z.literal('')]).optional(),
  password: z.string().min(8).max(128).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

const assignWardEngineerSchema = z.object({
  assignedEngineer: z.union([objectId, z.literal('')]),
});

const updateWardSlaSchema = z.object({
  slaHours: z.coerce.number().int().positive().max(2160),
});

const idParamSchema = z.object({
  id: objectId,
});

module.exports = {
  assignWardEngineerSchema,
  createUserSchema,
  createWardSchema,
  idParamSchema,
  listUsersQuerySchema,
  staffRoleSchema,
  updateUserSchema,
  updateWardSlaSchema,
  updateWardSchema,
};
