const express = require('express');
const User = require('../models/User');
const Ward = require('../models/Ward');
const { ROLE_RANKS, requireRole } = require('../middleware/auth');
const { validate, validateParams, validateQuery } = require('../middleware/validate');
const {
  assignWardEngineerSchema,
  createUserSchema,
  createWardSchema,
  idParamSchema,
  listUsersQuerySchema,
  updateUserSchema,
  updateWardSlaSchema,
  updateWardSchema,
} = require('../schemas/settings');

const router = express.Router();
const STAFF_ROLES = ['engineer', 'supervisor', 'commissioner', 'admin'];

const cleanOptionalObjectId = (value) => (value === '' ? undefined : value);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const serializeUser = (user) => ({
  id: user._id,
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  ward: user.ward,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const ensureCanManageRole = (actorRole, targetRole) => {
  const actorRank = ROLE_RANKS[actorRole];
  const targetRank = ROLE_RANKS[targetRole];

  if (actorRank === undefined || targetRank === undefined || actorRank < targetRank) {
    const err = new Error('Insufficient permissions to manage this role');
    err.statusCode = 403;
    throw err;
  }
};

const ensureWardExists = async (wardId) => {
  if (!wardId) return;

  const exists = await Ward.exists({ _id: wardId });
  if (!exists) {
    const err = new Error('Ward not found');
    err.statusCode = 404;
    throw err;
  }
};

const ensureAssignedEngineer = async (engineerId) => {
  if (!engineerId) return;

  const engineer = await User.findOne({ _id: engineerId, role: 'engineer' });
  if (!engineer) {
    const err = new Error('Assigned engineer not found');
    err.statusCode = 404;
    throw err;
  }
};

const populateWard = (query) => query.populate('assignedEngineer', 'name email phone role');
const populateUser = (query) => query.populate('ward', 'name slaHours');

router.get('/users', requireRole('supervisor'), validateQuery(listUsersQuerySchema), async (req, res, next) => {
  try {
    const filter = { role: { $in: STAFF_ROLES } };
    if (req.query.role) {
      ensureCanManageRole(req.auth.role, req.query.role);
      filter.role = req.query.role;
    } else {
      filter.role = {
        $in: STAFF_ROLES.filter((role) => ROLE_RANKS[role] <= ROLE_RANKS[req.auth.role]),
      };
    }
    if (req.query.ward) {
      filter.ward = req.query.ward;
    }

    const users = await populateUser(
      User.find(filter)
        .select('name email phone role ward createdAt updatedAt')
        .sort({ role: 1, name: 1 })
        .limit(200)
    ).lean();

    res.json({ users: users.map(serializeUser) });
  } catch (err) {
    next(err);
  }
});

router.post('/users', requireRole('supervisor'), validate(createUserSchema), async (req, res, next) => {
  try {
    const { name, email, phone, role, password } = req.body;
    const ward = cleanOptionalObjectId(req.body.ward);

    ensureCanManageRole(req.auth.role, role);
    await ensureWardExists(ward);

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = new User({
      name,
      email,
      phone,
      role,
      ward,
      passwordHash: password,
    });

    await user.save();
    await user.populate('ward', 'name slaHours');

    res.status(201).json({ user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/users/:id',
  requireRole('supervisor'),
  validateParams(idParamSchema),
  validate(updateUserSchema),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user || !STAFF_ROLES.includes(user.role)) {
        return res.status(404).json({ error: 'Staff user not found' });
      }

      ensureCanManageRole(req.auth.role, user.role);
      if (req.body.role) {
        ensureCanManageRole(req.auth.role, req.body.role);
      }

      const ward = cleanOptionalObjectId(req.body.ward);
      if (hasOwn(req.body, 'ward')) {
        await ensureWardExists(ward);
        user.ward = ward;
      }

      if (req.body.name !== undefined) user.name = req.body.name;
      if (req.body.email !== undefined) user.email = req.body.email;
      if (req.body.phone !== undefined) user.phone = req.body.phone;
      if (req.body.role !== undefined) user.role = req.body.role;
      if (req.body.password !== undefined) user.passwordHash = req.body.password;

      await user.save();
      await user.populate('ward', 'name slaHours');

      res.json({ user: serializeUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/wards', requireRole('engineer'), async (req, res, next) => {
  try {
    const wards = await populateWard(
      Ward.find({})
        .select('name boundary slaHours assignedEngineer createdAt updatedAt')
        .sort({ name: 1 })
    ).lean();

    res.json({ wards });
  } catch (err) {
    next(err);
  }
});

router.post('/wards', requireRole('supervisor'), validate(createWardSchema), async (req, res, next) => {
  try {
    const assignedEngineer = cleanOptionalObjectId(req.body.assignedEngineer);
    await ensureAssignedEngineer(assignedEngineer);

    const ward = new Ward({
      name: req.body.name,
      boundary: req.body.boundary,
      assignedEngineer,
      slaHours: req.body.slaHours,
    });

    await ward.save();
    await ward.populate('assignedEngineer', 'name email phone role');

    res.status(201).json({ ward });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/wards/:id',
  requireRole('supervisor'),
  validateParams(idParamSchema),
  validate(updateWardSchema),
  async (req, res, next) => {
    try {
      const update = { ...req.body };
      const set = { ...update };
      const unset = {};

      if (hasOwn(update, 'assignedEngineer')) {
        const assignedEngineer = cleanOptionalObjectId(update.assignedEngineer);
        await ensureAssignedEngineer(assignedEngineer);

        if (assignedEngineer) {
          set.assignedEngineer = assignedEngineer;
        } else {
          delete set.assignedEngineer;
          unset.assignedEngineer = '';
        }
      }

      const changes = {};
      if (Object.keys(set).length > 0) changes.$set = set;
      if (Object.keys(unset).length > 0) changes.$unset = unset;

      const ward = await populateWard(
        Ward.findByIdAndUpdate(
          req.params.id,
          changes,
          { new: true, runValidators: true }
        )
      );

      if (!ward) {
        return res.status(404).json({ error: 'Ward not found' });
      }

      res.json({ ward });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/wards/:id/engineer',
  requireRole('supervisor'),
  validateParams(idParamSchema),
  validate(assignWardEngineerSchema),
  async (req, res, next) => {
    try {
      const assignedEngineer = cleanOptionalObjectId(req.body.assignedEngineer);
      await ensureAssignedEngineer(assignedEngineer);
      const changes = assignedEngineer
        ? { $set: { assignedEngineer } }
        : { $unset: { assignedEngineer: '' } };

      const ward = await populateWard(
        Ward.findByIdAndUpdate(
          req.params.id,
          changes,
          { new: true, runValidators: true }
        )
      );

      if (!ward) {
        return res.status(404).json({ error: 'Ward not found' });
      }

      res.json({ ward });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/wards/:id/sla',
  requireRole('supervisor'),
  validateParams(idParamSchema),
  validate(updateWardSlaSchema),
  async (req, res, next) => {
    try {
      const ward = await populateWard(
        Ward.findByIdAndUpdate(
          req.params.id,
          { $set: { slaHours: req.body.slaHours } },
          { new: true, runValidators: true }
        )
      );

      if (!ward) {
        return res.status(404).json({ error: 'Ward not found' });
      }

      res.json({ ward });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
