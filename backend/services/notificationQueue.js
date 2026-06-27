const redis = require('../config/redis');
const { notify } = require('./notifications');

const NOTIFICATION_QUEUE_NAME = 'notifications';
const NOTIFICATION_JOB_NAME = 'send-notification';

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 5000;

const getPositiveIntegerEnv = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const notificationJobOptions = () => ({
  attempts: getPositiveIntegerEnv('NOTIFICATION_QUEUE_ATTEMPTS', DEFAULT_ATTEMPTS),
  backoff: {
    type: 'exponential',
    delay: getPositiveIntegerEnv('NOTIFICATION_QUEUE_BACKOFF_MS', DEFAULT_BACKOFF_MS),
  },
  removeOnComplete: true,
  removeOnFail: false,
});

let queue = null;
let warnedMissingRedis = false;

const isNotificationQueueEnabled = () => process.env.ENABLE_NOTIFICATION_QUEUE === 'true';

const isNotificationQueueConfigured = () => {
  const configured = isNotificationQueueEnabled() && Boolean(redis);
  if (isNotificationQueueEnabled() && !redis && !warnedMissingRedis) {
    warnedMissingRedis = true;
    console.warn('[Queue] Notification queue disabled because REDIS_URL is not set.');
  }
  return configured;
};

const getNotificationQueue = () => {
  if (!isNotificationQueueConfigured()) {
    return null;
  }

  if (!queue) {
    const { Queue } = require('bullmq');
    queue = new Queue(NOTIFICATION_QUEUE_NAME, { connection: redis });
  }

  return queue;
};

const serializeUserForNotification = (user) => {
  if (!user) return null;

  const source = typeof user.toObject === 'function' ? user.toObject() : user;
  const id = source._id || source.id;

  return {
    ...(id ? { id: id.toString() } : {}),
    name: source.name,
    email: source.email,
    phone: source.phone,
    fcmToken: source.fcmToken,
  };
};

const serializeNotification = ({ title, body, channels = ['fcm'], data = {} }) => ({
  title,
  body,
  channels,
  data,
});

const hasDeliverableChannel = (user, { channels = ['fcm'] }) => {
  if (!user) return false;

  return (
    (channels.includes('fcm') && Boolean(user.fcmToken)) ||
    (channels.includes('sms') && Boolean(user.phone)) ||
    (channels.includes('email') && Boolean(user.email))
  );
};

const enqueueNotification = async (user, notification) => {
  const notificationQueue = getNotificationQueue();
  if (!notificationQueue) {
    return null;
  }

  return notificationQueue.add(
    NOTIFICATION_JOB_NAME,
    {
      user: serializeUserForNotification(user),
      notification: serializeNotification(notification),
    },
    notificationJobOptions()
  );
};

const dispatchNotification = async (user, notification) => {
  if (!isNotificationQueueConfigured() || !hasDeliverableChannel(user, notification)) {
    return notify(user, notification);
  }

  try {
    await enqueueNotification(user, notification);
    return true;
  } catch (err) {
    console.error('[Queue] Failed to enqueue notification; sending synchronously:', err.message);
    return notify(user, notification);
  }
};

const processNotificationJob = async (job) => {
  const { user, notification } = job.data || {};
  if (!user || !notification) {
    throw new Error('Invalid notification job payload');
  }

  const delivered = await notify(user, notification);
  if (!delivered) {
    throw new Error('Notification delivery failed');
  }

  return delivered;
};

const resetNotificationQueueForTests = () => {
  queue = null;
  warnedMissingRedis = false;
};

module.exports = {
  NOTIFICATION_QUEUE_NAME,
  NOTIFICATION_JOB_NAME,
  dispatchNotification,
  enqueueNotification,
  getNotificationQueue,
  isNotificationQueueConfigured,
  notificationJobOptions,
  processNotificationJob,
  resetNotificationQueueForTests,
  hasDeliverableChannel,
  serializeNotification,
  serializeUserForNotification,
};
