const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validate } = require('../middleware/validate');
const { requireRole } = require('../middleware/auth');
const { registerSchema, loginSchema, refreshSchema, deviceSchema } = require('../schemas/auth');

const router = express.Router();
const jwtSecret = () => process.env.JWT_SECRET || 'potholetrack-dev-secret-change-me';

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { name, email, phone, password, role, ward, fcmToken, deviceId } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = new User({
      name,
      email,
      phone,
      role: role || 'citizen',
      ward,
      fcmToken,
      deviceId,
      passwordHash: password,
    });
    await user.save();

    const token = jwt.sign(
      { sub: user._id, role: user.role },
      jwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        ward: user.ward,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { sub: user._id, role: user.role },
      jwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        ward: user.ward,
      },
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
