const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');

let firebaseInitialized = false;
let twilioClient = null;
let sendGridApiKey = null;

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

const initSendGrid = () => {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn('[Email] Cannot send email: SENDGRID_API_KEY and EMAIL_FROM must be configured');
    return false;
  }

  if (sendGridApiKey !== apiKey) {
    sgMail.setApiKey(apiKey);
    sendGridApiKey = apiKey;
  }

  return true;
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
  if (!initSendGrid()) {
    return false;
  }

  if (!to) {
    console.warn('[Email] Cannot send email: recipient is missing');
    return false;
  }

  try {
    await sgMail.send({
      to,
      from: process.env.EMAIL_FROM,
      subject,
      text: body,
    });
    console.log('[Email] Email sent to', to);
    return true;
  } catch (err) {
    console.error('[Email] Failed to send email:', err.message);
    return false;
  }
};

const notify = async (user, { title, body, channels = ['fcm'], data = {} }) => {
  if (!user) return false;

  const results = [];
  if (channels.includes('fcm') && user.fcmToken) {
    results.push(await sendPushNotification(user.fcmToken, title, body, data));
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
