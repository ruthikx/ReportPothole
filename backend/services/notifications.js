const admin = require('firebase-admin');
const twilio = require('twilio');

let firebaseInitialized = false;
let twilioClient = null;

const initFirebase = () => {
  if (firebaseInitialized) return;
  try {
    const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SA_KEY;
    if (!saKey) {
      console.warn('[FCM] Firebase service account key not configured');
      return;
    }
    const serviceAccount = JSON.parse(
      typeof saKey === 'string' ? saKey : JSON.stringify(saKey)
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseInitialized = true;
    console.log('[FCM] Firebase initialized');
  } catch (err) {
    console.error('[FCM] Failed to initialize Firebase:', err.message);
  }
};

const initTwilio = () => {
  if (twilioClient) return;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    console.warn('[Twilio] Credentials not configured');
    return;
  }
  twilioClient = twilio(sid, token);
};

const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  initFirebase();
  if (!firebaseInitialized || !fcmToken) {
    console.warn('[FCM] Cannot send push: Firebase not initialized or no token');
    return false;
  }
  try {
    const message = {
      token: fcmToken,
      notification: { title, body },
      data,
    };
    await admin.messaging().send(message);
    console.log('[FCM] Push sent successfully');
    return true;
  } catch (err) {
    console.error('[FCM] Failed to send push:', err.message);
    return false;
  }
};

const sendSms = async (to, message) => {
  initTwilio();
  if (!twilioClient) {
    console.warn('[Twilio] Cannot send SMS: client not initialized');
    return false;
  }
  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_FROM || process.env.TWILIO_FROM_NUMBER,
      to,
    });
    console.log('[Twilio] SMS sent to', to);
    return true;
  } catch (err) {
    console.error('[Twilio] Failed to send SMS:', err.message);
    return false;
  }
};

const sendEmail = async (to, subject, body) => {
  if (!to || !process.env.SENDGRID_API_KEY) {
    console.warn('[Email] Cannot send email: SendGrid is not configured');
    return false;
  }

  console.log('[Email] Email dispatch placeholder:', { to, subject, body });
  return true;
};

const notify = async (user, { title, body, channels = ['fcm'] }) => {
  if (!user) return false;

  const results = [];
  if (channels.includes('fcm') && user.fcmToken) {
    results.push(await sendPushNotification(user.fcmToken, title, body));
  }
  if (channels.includes('sms') && user.phone) {
    results.push(await sendSms(user.phone, `${title}\n${body}`));
  }
  if (channels.includes('email') && user.email) {
    results.push(await sendEmail(user.email, title, body));
  }

  return results.some(Boolean);
};

module.exports = { sendPushNotification, sendSms, sendEmail, notify };
