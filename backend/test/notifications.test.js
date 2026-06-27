const ORIGINAL_ENV = process.env;

const mockFirebaseSend = jest.fn();
const mockFirebaseInitializeApp = jest.fn();
const mockFirebaseCert = jest.fn((serviceAccount) => serviceAccount);
const mockTwilioCreate = jest.fn();
const mockTwilio = jest.fn(() => ({
  messages: {
    create: mockTwilioCreate,
  },
}));
const mockSendGridSetApiKey = jest.fn();
const mockSendGridSend = jest.fn();

jest.mock('firebase-admin', () => ({
  initializeApp: mockFirebaseInitializeApp,
  credential: {
    cert: mockFirebaseCert,
  },
  messaging: jest.fn(() => ({
    send: mockFirebaseSend,
  })),
}));

jest.mock('twilio', () => mockTwilio);

jest.mock('@sendgrid/mail', () => ({
  setApiKey: mockSendGridSetApiKey,
  send: mockSendGridSend,
}));

const loadNotifications = () => {
  jest.resetModules();
  return require('../services/notifications');
};

describe('notification service', () => {
  let warnSpy;
  let errorSpy;
  let logSpy;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    delete process.env.FIREBASE_SA_KEY;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM;
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.EMAIL_FROM;

    mockFirebaseSend.mockResolvedValue('firebase-message-id');
    mockFirebaseInitializeApp.mockClear();
    mockFirebaseCert.mockClear();
    mockTwilio.mockClear();
    mockTwilioCreate.mockResolvedValue({ sid: 'sms-message-id' });
    mockSendGridSetApiKey.mockClear();
    mockSendGridSend.mockResolvedValue([{ statusCode: 202 }]);

    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('sendEmail returns false and warns when SendGrid config is missing', async () => {
    const { sendEmail } = loadNotifications();

    await expect(sendEmail('officer@example.com', 'Subject', 'Body')).resolves.toBe(false);

    expect(mockSendGridSetApiKey).not.toHaveBeenCalled();
    expect(mockSendGridSend).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Email] Cannot send email: SENDGRID_API_KEY and EMAIL_FROM must be configured'
    );
  });

  test('sendEmail sends through SendGrid when configured', async () => {
    process.env.SENDGRID_API_KEY = 'sendgrid-api-key';
    process.env.EMAIL_FROM = 'alerts@example.com';

    const { sendEmail } = loadNotifications();

    await expect(sendEmail('officer@example.com', 'Subject', 'Body')).resolves.toBe(true);

    expect(mockSendGridSetApiKey).toHaveBeenCalledWith('sendgrid-api-key');
    expect(mockSendGridSend).toHaveBeenCalledWith({
      to: 'officer@example.com',
      from: 'alerts@example.com',
      subject: 'Subject',
      text: 'Body',
    });
  });

  test('sendEmail catches SendGrid errors and returns false', async () => {
    process.env.SENDGRID_API_KEY = 'sendgrid-api-key';
    process.env.EMAIL_FROM = 'alerts@example.com';
    mockSendGridSend.mockRejectedValue(new Error('provider unavailable'));

    const { sendEmail } = loadNotifications();

    await expect(sendEmail('officer@example.com', 'Subject', 'Body')).resolves.toBe(false);

    expect(errorSpy).toHaveBeenCalledWith(
      '[Email] Failed to send email:',
      'provider unavailable'
    );
  });

  test('notify dispatches requested Firebase, Twilio, and SendGrid channels', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
      project_id: 'test-project',
      client_email: 'firebase@example.com',
      private_key: 'test-private-key',
    });
    process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
    process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
    process.env.TWILIO_FROM = '+10000000000';
    process.env.SENDGRID_API_KEY = 'sendgrid-api-key';
    process.env.EMAIL_FROM = 'alerts@example.com';

    const { notify } = loadNotifications();

    await expect(
      notify(
        {
          fcmToken: 'fcm-token',
          phone: '+15555550123',
          email: 'officer@example.com',
        },
        {
          title: 'Escalation',
          body: 'Ticket is overdue',
          channels: ['fcm', 'sms', 'email'],
        }
      )
    ).resolves.toBe(true);

    expect(mockFirebaseInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockFirebaseSend).toHaveBeenCalledWith({
      token: 'fcm-token',
      notification: {
        title: 'Escalation',
        body: 'Ticket is overdue',
      },
      data: {},
    });
    expect(mockTwilio).toHaveBeenCalledWith('twilio-sid', 'twilio-token');
    expect(mockTwilioCreate).toHaveBeenCalledWith({
      body: 'Escalation\nTicket is overdue',
      from: '+10000000000',
      to: '+15555550123',
    });
    expect(mockSendGridSend).toHaveBeenCalledWith({
      to: 'officer@example.com',
      from: 'alerts@example.com',
      subject: 'Escalation',
      text: 'Ticket is overdue',
    });
  });

  test('notify returns false instead of throwing when email provider fails', async () => {
    process.env.SENDGRID_API_KEY = 'sendgrid-api-key';
    process.env.EMAIL_FROM = 'alerts@example.com';
    mockSendGridSend.mockRejectedValue(new Error('sendgrid outage'));

    const { notify } = loadNotifications();

    await expect(
      notify(
        { email: 'officer@example.com' },
        {
          title: 'Escalation',
          body: 'Ticket is overdue',
          channels: ['email'],
        }
      )
    ).resolves.toBe(false);
  });
});
