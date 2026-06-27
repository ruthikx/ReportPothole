const Redis = require('ioredis');

const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : null;

if (!redis) {
  console.warn('[Redis] REDIS_URL not set; Redis-backed features will use local fallbacks.');
}

module.exports = redis;
