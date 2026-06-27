const redis = require('../config/redis');
const {
  NOTIFICATION_QUEUE_NAME,
  isNotificationQueueConfigured,
  processNotificationJob,
} = require('../services/notificationQueue');

let worker = null;

const getWorkerConcurrency = () => {
  const parsed = Number.parseInt(process.env.NOTIFICATION_WORKER_CONCURRENCY, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 5;
};

const shouldStartNotificationWorker = () => {
  if (!isNotificationQueueConfigured()) {
    return false;
  }

  return process.env.NODE_ENV !== 'test' || process.env.ENABLE_NOTIFICATION_WORKER === 'true';
};

const startNotificationWorker = () => {
  if (worker || !shouldStartNotificationWorker()) {
    return worker;
  }

  const { Worker } = require('bullmq');
  worker = new Worker(NOTIFICATION_QUEUE_NAME, processNotificationJob, {
    connection: redis,
    concurrency: getWorkerConcurrency(),
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[Queue] Notification job ${job?.id || 'unknown'} failed:`,
      err.message
    );
  });

  worker.on('completed', (job) => {
    console.log(`[Queue] Notification job ${job.id} completed`);
  });

  return worker;
};

const stopNotificationWorker = async () => {
  if (!worker) {
    return;
  }

  await worker.close();
  worker = null;
};

if (require.main === module) {
  const activeWorker = startNotificationWorker();
  if (!activeWorker) {
    console.warn('[Queue] Notification worker not started; queue is disabled or Redis is missing.');
  } else {
    console.log('[Queue] Notification worker started');

    const shutdown = async () => {
      await stopNotificationWorker();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

module.exports = {
  shouldStartNotificationWorker,
  startNotificationWorker,
  stopNotificationWorker,
};
