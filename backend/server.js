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
const errorHandler = require('./middleware/errorHandler');
const { runEscalationJob } = require('./services/escalation');

const app = express();
const PORT = process.env.PORT || 3000;

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
  notificationQueue = new BullQueue('notifications', { connection: redis });
}

app.use(
  '/api/v1',
  jwt({
    secret: process.env.JWT_SECRET,
    algorithms: ['HS256'],
  }).unless({
    path: [
      { url: '/auth/register', methods: ['POST'] },
      { url: '/auth/login', methods: ['POST'] },
      { url: '/auth/refresh', methods: ['POST'] },
      { url: '/reports', methods: ['POST'] },
      { url: /^\/reports\/[^/]+$/, methods: ['GET'] },
      { url: /^\/reports\/[^/]+\/upvote$/, methods: ['POST'] },
    ],
  })
);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use('/api/v1/stats', statsRoutes);

app.use(errorHandler);

cron.schedule('0 6 * * *', async () => {
  console.log('[Cron] Running daily escalation check at 06:00');
  try {
    await runEscalationJob();
  } catch (err) {
    console.error('[Cron] Escalation job failed:', err);
  }
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = { app, notificationQueue };
