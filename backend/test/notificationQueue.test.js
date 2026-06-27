const ORIGINAL_ENV = process.env;

const loadNotificationQueue = ({ redis = null, notify = jest.fn(), Queue } = {}) => {
  jest.resetModules();
  jest.doMock('../config/redis', () => redis);
  jest.doMock('../services/notifications', () => ({ notify }));

  if (Queue) {
    jest.doMock('bullmq', () => ({ Queue }));
  }

  return require('../services/notificationQueue');
};

describe('notification queue service', () => {
  let errorSpy;
  let warnSpy;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REDIS_URL;
    delete process.env.ENABLE_NOTIFICATION_QUEUE;
    delete process.env.NOTIFICATION_QUEUE_ATTEMPTS;
    delete process.env.NOTIFICATION_QUEUE_BACKOFF_MS;

    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    jest.dontMock('../config/redis');
    jest.dontMock('../services/notifications');
    jest.dontMock('bullmq');
  });

  test('dispatchNotification sends synchronously when queue is disabled', async () => {
    process.env.ENABLE_NOTIFICATION_QUEUE = 'false';
    const notify = jest.fn().mockResolvedValue(true);
    const Queue = jest.fn();
    const { dispatchNotification } = loadNotificationQueue({
      redis: { status: 'ready' },
      notify,
      Queue,
    });

    const user = { fcmToken: 'fcm-token' };
    const notification = {
      title: 'Assigned',
      body: 'Ticket assigned',
      channels: ['fcm'],
    };

    await expect(dispatchNotification(user, notification)).resolves.toBe(true);

    expect(notify).toHaveBeenCalledWith(user, notification);
    expect(Queue).not.toHaveBeenCalled();
  });

  test('dispatchNotification sends synchronously when Redis is missing', async () => {
    process.env.ENABLE_NOTIFICATION_QUEUE = 'true';
    const notify = jest.fn().mockResolvedValue(true);
    const Queue = jest.fn();
    const { dispatchNotification } = loadNotificationQueue({
      redis: null,
      notify,
      Queue,
    });

    await expect(
      dispatchNotification(
        { phone: '+15555550123' },
        { title: 'Escalation', body: 'Ticket overdue', channels: ['sms'] }
      )
    ).resolves.toBe(true);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(Queue).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Queue] Notification queue disabled because REDIS_URL is not set.'
    );
  });

  test('dispatchNotification enqueues with retry and backoff settings when queue is enabled', async () => {
    process.env.ENABLE_NOTIFICATION_QUEUE = 'true';
    process.env.NOTIFICATION_QUEUE_ATTEMPTS = '5';
    process.env.NOTIFICATION_QUEUE_BACKOFF_MS = '1500';

    const add = jest.fn().mockResolvedValue({ id: 'job-1' });
    const Queue = jest.fn(() => ({ add }));
    const notify = jest.fn();
    const redis = { status: 'ready' };
    const { dispatchNotification } = loadNotificationQueue({ redis, notify, Queue });

    await expect(
      dispatchNotification(
        {
          _id: 'user-1',
          name: 'Worker One',
          email: 'worker@example.com',
          phone: '+15555550123',
          fcmToken: 'fcm-token',
        },
        {
          title: 'Assigned',
          body: 'Ticket assigned',
          channels: ['fcm', 'sms'],
          data: { ticketId: 'ticket-1' },
        }
      )
    ).resolves.toBe(true);

    expect(Queue).toHaveBeenCalledWith('notifications', { connection: redis });
    expect(add).toHaveBeenCalledWith(
      'send-notification',
      {
        user: {
          id: 'user-1',
          name: 'Worker One',
          email: 'worker@example.com',
          phone: '+15555550123',
          fcmToken: 'fcm-token',
        },
        notification: {
          title: 'Assigned',
          body: 'Ticket assigned',
          channels: ['fcm', 'sms'],
          data: { ticketId: 'ticket-1' },
        },
      },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1500,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
    expect(notify).not.toHaveBeenCalled();
  });

  test('processNotificationJob calls existing notify implementation', async () => {
    const notify = jest.fn().mockResolvedValue(true);
    const { processNotificationJob } = loadNotificationQueue({ notify });
    const job = {
      data: {
        user: { email: 'citizen@example.com' },
        notification: {
          title: 'Resolved',
          body: 'Your report has been resolved.',
          channels: ['email'],
        },
      },
    };

    await expect(processNotificationJob(job)).resolves.toBe(true);

    expect(notify).toHaveBeenCalledWith(job.data.user, job.data.notification);
  });
});
