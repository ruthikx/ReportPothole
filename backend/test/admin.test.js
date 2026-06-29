const jwt = require('jsonwebtoken');
const request = require('supertest');
const { app } = require('../server');
const User = require('../models/User');
const Ward = require('../models/Ward');

const tokenFor = (user) => jwt.sign(
  { sub: user._id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const createUser = async (overrides = {}) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = new User({
    name: overrides.name || `User ${unique}`,
    email: overrides.email || `user-${unique}@example.com`,
    phone: overrides.phone,
    role: overrides.role || 'citizen',
    ward: overrides.ward,
    passwordHash: overrides.password || 'password123',
  });

  await user.save();
  return user;
};

const squareBoundary = (offset = 0) => ({
  type: 'Polygon',
  coordinates: [[
    [77 + offset, 12],
    [77.01 + offset, 12],
    [77.01 + offset, 12.01],
    [77 + offset, 12.01],
    [77 + offset, 12],
  ]],
});

const createWard = async (overrides = {}) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return Ward.create({
    name: overrides.name || `Ward ${unique}`,
    boundary: overrides.boundary || squareBoundary(Math.random() / 100),
    assignedEngineer: overrides.assignedEngineer,
    slaHours: overrides.slaHours || 168,
  });
};

describe('admin management routes', () => {
  test('public register creates citizen accounts and rejects staff roles', async () => {
    const citizenResponse = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Citizen Public',
        email: 'citizen-public@example.com',
        password: 'password123',
      })
      .expect(201);

    expect(citizenResponse.body.user.role).toBe('citizen');

    await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Worker Public',
        email: 'worker-public@example.com',
        password: 'password123',
        role: 'worker',
      })
      .expect(400);
  });

  test('admin login rejects citizens and allows staff users', async () => {
    const citizen = await createUser({
      role: 'citizen',
      email: 'citizen-login@example.com',
      password: 'password123',
    });
    const engineer = await createUser({
      role: 'engineer',
      email: 'engineer-login@example.com',
      password: 'password123',
    });

    await request(app)
      .post('/api/v1/auth/admin/login')
      .send({ email: citizen.email, password: 'password123' })
      .expect(403);

    const response = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({ email: engineer.email, password: 'password123' })
      .expect(200);

    expect(response.body.token).toBeTruthy();
    expect(response.body.user).toMatchObject({
      email: engineer.email,
      role: 'engineer',
    });
  });

  test('citizens are forbidden from staff and ward management', async () => {
    const citizen = await createUser({ role: 'citizen', email: 'citizen@example.com' });
    const token = tokenFor(citizen);

    await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    await request(app)
      .patch(`/api/v1/admin/wards/${citizen._id}/sla`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slaHours: 72 })
      .expect(403);
  });

  test('engineers can list wards but cannot create staff or update wards', async () => {
    const engineer = await createUser({ role: 'engineer', email: 'engineer@example.com' });
    const ward = await createWard({ assignedEngineer: engineer._id });
    const token = tokenFor(engineer);

    const listResponse = await request(app)
      .get('/api/v1/admin/wards')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body.wards).toHaveLength(1);
    expect(listResponse.body.wards[0]).toMatchObject({
      name: ward.name,
      slaHours: 168,
    });

    await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Staff Blocked',
        email: 'staff-blocked@example.com',
        password: 'password123',
        role: 'engineer',
      })
      .expect(403);

    await request(app)
      .patch(`/api/v1/admin/wards/${ward._id}/sla`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slaHours: 72 })
      .expect(403);
  });

  test('supervisors can create engineers but cannot create admins', async () => {
    const supervisor = await createUser({ role: 'supervisor', email: 'supervisor@example.com' });
    const ward = await createWard();
    const token = tokenFor(supervisor);

    const response = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Engineer Managed',
        email: 'engineer-managed@example.com',
        phone: '+15555550123',
        password: 'password123',
        role: 'engineer',
        ward: String(ward._id),
      })
      .expect(201);

    expect(response.body.user).toMatchObject({
      name: 'Engineer Managed',
      email: 'engineer-managed@example.com',
      phone: '+15555550123',
      role: 'engineer',
    });
    expect(response.body.user.passwordHash).toBeUndefined();

    const saved = await User.findOne({ email: 'engineer-managed@example.com' });
    expect(saved).toBeTruthy();
    expect(saved.role).toBe('engineer');
    await expect(saved.comparePassword('password123')).resolves.toBe(true);

    await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Admin Blocked',
        email: 'admin-blocked@example.com',
        password: 'password123',
        role: 'admin',
      })
      .expect(403);
  });

  test('admins can create staff and update ward engineer and SLA', async () => {
    const admin = await createUser({ role: 'admin', email: 'admin@example.com' });
    const engineer = await createUser({ role: 'engineer', email: 'ward-engineer@example.com' });
    const token = tokenFor(admin);

    const createWardResponse = await request(app)
      .post('/api/v1/admin/wards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Central Ward',
        boundary: squareBoundary(),
        assignedEngineer: String(engineer._id),
        slaHours: 96,
      })
      .expect(201);

    expect(createWardResponse.body.ward).toMatchObject({
      name: 'Central Ward',
      slaHours: 96,
    });
    expect(createWardResponse.body.ward.assignedEngineer).toMatchObject({
      name: engineer.name,
      role: 'engineer',
    });

    const commissionerResponse = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Commissioner Managed',
        email: 'commissioner-managed@example.com',
        password: 'password123',
        role: 'commissioner',
      })
      .expect(201);

    expect(commissionerResponse.body.user.role).toBe('commissioner');

    const slaResponse = await request(app)
      .patch(`/api/v1/admin/wards/${createWardResponse.body.ward._id}/sla`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slaHours: 48 })
      .expect(200);

    expect(slaResponse.body.ward.slaHours).toBe(48);

    const replacementEngineer = await createUser({
      role: 'engineer',
      email: 'replacement-engineer@example.com',
    });

    const updateResponse = await request(app)
      .patch(`/api/v1/admin/wards/${createWardResponse.body.ward._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Central Ward Updated',
        assignedEngineer: String(replacementEngineer._id),
        slaHours: 24,
      })
      .expect(200);

    expect(updateResponse.body.ward).toMatchObject({
      name: 'Central Ward Updated',
      slaHours: 24,
    });
    expect(updateResponse.body.ward.assignedEngineer).toMatchObject({
      email: 'replacement-engineer@example.com',
      role: 'engineer',
    });
  });
});
