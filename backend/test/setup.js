const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.REDIS_URL = '';
process.env.ENABLE_NOTIFICATION_QUEUE = 'false';
process.env.UPLOAD_STORAGE = 'local';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();
  process.env.MONGODB_URI = process.env.MONGO_URI;

  await mongoose.connect(process.env.MONGO_URI);
}, 60000);

afterEach(async () => {
  if (!mongoose.connection.db) {
    return;
  }

  const collections = await mongoose.connection.db.collections();

  await Promise.all(
    collections.map((collection) => collection.deleteMany({}))
  );
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (mongoServer) {
    await mongoServer.stop();
  }
});
