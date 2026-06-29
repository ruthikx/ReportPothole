require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cron = require('node-cron');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { expressjwt: jwt } = require('express-jwt');

const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const ticketRoutes = require('./routes/tickets');
const statsRoutes = require('./routes/stats');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const errorHandler = require('./middleware/errorHandler');
const { runEscalationJob } = require('./services/escalation');
const { startNotificationWorker } = require('./workers/notificationWorker');
const { getNotificationQueue } = require('./services/notificationQueue');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'potholetrack-dev-secret-change-me';

if (!process.env.JWT_SECRET) {
  console.warn('[Config] JWT_SECRET is not set; using an insecure development fallback.');
}

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

const apiAuth = jwt({
  secret: JWT_SECRET,
  algorithms: ['HS256'],
}).unless({
  useOriginalUrl: false,
  path: [
    { url: '/auth/register', methods: ['POST'] },
    { url: '/auth/login', methods: ['POST'] },
    { url: '/auth/admin/login', methods: ['POST'] },
    { url: '/auth/refresh', methods: ['POST'] },
    { url: '/reports', methods: ['GET'] },
    { url: '/reports', methods: ['POST'] },
    { url: /^\/reports\/(?!mine$)[^/]+$/, methods: ['GET'] },
    { url: /^\/reports\/[^/]+\/upvote$/, methods: ['POST'] },
    { url: /^\/dashboard(?:\/.*)?$/, methods: ['GET'] },
  ],
});

const apiRouter = express.Router();
apiRouter.use(apiAuth);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/tickets', ticketRoutes);
apiRouter.use('/stats', statsRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/admin', adminRoutes);

app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

app.use(errorHandler);

let escalationCron = null;
const shouldStartBackgroundJobs = () => process.env.NODE_ENV !== 'test';

const startBackgroundJobs = () => {
  startNotificationWorker();

  if (escalationCron || !shouldStartBackgroundJobs()) {
    return escalationCron;
  }

  escalationCron = cron.schedule('0 6 * * *', async () => {
    console.log('[Cron] Running daily escalation check at 06:00');
    try {
      await runEscalationJob();
    } catch (err) {
      console.error('[Cron] Escalation job failed:', err);
    }
  });

  return escalationCron;
};

const start = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI or MONGODB_URI must be set');
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
  startBackgroundJobs();
  return app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

if (require.main === module) {
  start().catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
}

const exported = { app, getNotificationQueue, start, startBackgroundJobs };
Object.defineProperty(exported, 'notificationQueue', {
  enumerable: true,
  get: getNotificationQueue,
});

module.exports = exported;
