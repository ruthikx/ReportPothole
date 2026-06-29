const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validate } = require('../middleware/validate');
const { requireRole } = require('../middleware/auth');
const { registerSchema, loginSchema, refreshSchema, deviceSchema } = require('../schemas/auth');

const router = express.Router();
const jwtSecret = () => process.env.JWT_SECRET || 'potholetrack-dev-secret-change-me';
const ADMIN_LOGIN_ROLES = ['engineer', 'supervisor', 'commissioner', 'admin'];

const createToken = (user) => jwt.sign(
  { sub: user._id, role: user.role },
  jwtSecret(),
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

const serializeAuthUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  ward: user.ward,
});

const authenticateUser = async (email, password) => {
  const user = await User.findOne({ email });
  if (!user) return null;

  const isValid = await user.comparePassword(password);
  return isValid ? user : null;
};

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { name, email, phone, password, ward, fcmToken, deviceId } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = new User({
      name,
      email,
      phone,
      role: 'citizen',
      ward,
      fcmToken,
      deviceId,
      passwordHash: password,
    });
    await user.save();

    res.status(201).json({
      token: createToken(user),
      user: serializeAuthUser(user),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await authenticateUser(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({
      token: createToken(user),
      user: serializeAuthUser(user),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await authenticateUser(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!ADMIN_LOGIN_ROLES.includes(user.role)) {
      return res.status(403).json({ error: 'This account does not have admin portal access' });
    }

    res.json({
      token: createToken(user),
      user: serializeAuthUser(user),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const { token } = req.body;

    const decoded = jwt.verify(token, jwtSecret(), { ignoreExpiration: true });
    const user = await User.findById(decoded.sub);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newToken = jwt.sign(
      { sub: user._id, role: user.role },
      jwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ token: newToken });
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next(err);
  }
});

router.post('/device', requireRole('citizen'), validate(deviceSchema), async (req, res, next) => {
  try {
    const update = {};
    if (req.body.fcmToken) update.fcmToken = req.body.fcmToken;
    if (req.body.deviceId) update.deviceId = req.body.deviceId;

    await User.findByIdAndUpdate(req.auth.sub, update);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
