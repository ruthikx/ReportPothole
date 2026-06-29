const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.literal('citizen').optional(),
  ward: z.string().optional(),
  fcmToken: z.string().optional(),
  deviceId: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

const deviceSchema = z.object({
  fcmToken: z.string().min(1).max(500).optional(),
  deviceId: z.string().max(200).optional(),
}).refine((data) => data.fcmToken || data.deviceId, {
  message: 'fcmToken or deviceId is required',
});

module.exports = { registerSchema, loginSchema, refreshSchema, deviceSchema };
