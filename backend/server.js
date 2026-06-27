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
const errorHandler = require('./middleware/errorHandler');
const { runEscalationJob } = require('./services/escalation');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'potholetrack-dev-secret-change-me';
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

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

let notificationQueue = null;
if (process.env.ENABLE_NOTIFICATION_QUEUE === 'true') {
  const { Queue: BullQueue } = require('bullmq');
  const redis = require('./config/redis');
  if (redis) {
    notificationQueue = new BullQueue('notifications', { connection: redis });
  } else {
    console.warn('[Queue] Notification queue disabled because REDIS_URL is not set.');
  }
}

const apiAuth = jwt({
  secret: JWT_SECRET,
  algorithms: ['HS256'],
}).unless({
  useOriginalUrl: false,
  path: [
    { url: '/auth/register', methods: ['POST'] },
    { url: '/auth/login', methods: ['POST'] },
    { url: '/auth/refresh', methods: ['POST'] },
    { url: '/reports', methods: ['POST'] },
    { url: /^\/reports\/[^/]+$/, methods: ['GET'] },
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

app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

app.use(errorHandler);

cron.schedule('0 6 * * *', async () => {
  console.log('[Cron] Running daily escalation check at 06:00');
  try {
    await runEscalationJob();
  } catch (err) {
    console.error('[Cron] Escalation job failed:', err);
  }
});

const start = async () => {
  if (!mongoUri) {
    throw new Error('MONGO_URI or MONGODB_URI must be set');
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
  return app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

if (require.main === module) {
  start().catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
}

module.exports = { app, notificationQueue, start };
