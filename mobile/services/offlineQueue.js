import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import api from './api';

const QUEUE_KEY = 'offline_queue';
const MAX_RETRIES = 3;

const nowIso = () => new Date().toISOString();

const normalizeQueueItem = (item) => ({
  ...item,
  _id: item._id || Date.now().toString(),
  _retries: item._retries || 0,
  _status: item._status || 'queued',
  _lastError: item._lastError || null,
  _createdAt: item._createdAt || nowIso(),
  _updatedAt: item._updatedAt || nowIso(),
});

const getQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    return Array.isArray(queue) ? queue.map(normalizeQueueItem) : [];
  } catch {
    return [];
  }
};

const setQueue = async (queue) => {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

export const addToQueue = async (requestConfig) => {
  const queue = await getQueue();
  queue.push({
    ...requestConfig,
    _id: Date.now().toString(),
    _retries: 0,
    _status: 'queued',
    _lastError: null,
    _createdAt: nowIso(),
    _updatedAt: nowIso(),
  });
  await setQueue(queue);
};

const buildFormData = (parts = []) => {
  const formData = new FormData();

  parts.forEach((part) => {
    if (part.uri) {
      formData.append(part.name, {
        uri: part.uri,
        type: part.type || 'image/jpeg',
        name: part.fileName || `${part.name}.jpg`,
      });
      return;
    }

    formData.append(part.name, String(part.value ?? ''));
  });

  return formData;
};

export const flushQueue = async () => {
  const state = await NetInfo.fetch();
  if (!state.isConnected) {
    return getQueueSummary();
  }

  const queue = await getQueue();
  if (queue.length === 0) {
    return getQueueSummary();
  }

  const remaining = [];

  for (const item of queue) {
    try {
      const config = { ...item };
      delete config._id;
      delete config._retries;

      const method = config.method || 'post';
      const data = Array.isArray(config.multipart)
        ? buildFormData(config.multipart)
        : config.data;

      await api({
        method,
        url: config.url,
        data,
        headers: config.headers || {},
        params: config.params,
      });
    } catch (err) {
      const retries = (item._retries || 0) + 1;
      const failed = retries >= MAX_RETRIES;
      const nextItem = {
        ...item,
        _retries: retries,
        _status: failed ? 'failed' : 'queued',
        _lastError: err.response?.data?.error || err.message || 'Retry failed',
        _updatedAt: nowIso(),
      };

      if (failed) {
        console.error('[OfflineQueue] Failed after 3 retries:', item.url, err.message);
      }

      remaining.push(nextItem);
    }
  }

  await setQueue(remaining);
  return getQueueSummary();
};

export const setupOfflineListener = () => {
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      flushQueue();
    }
  });
  return unsubscribe;
};

export const getQueueLength = async () => {
  const queue = await getQueue();
  return queue.length;
};

export const getQueueSummary = async () => {
  const queue = await getQueue();
  return queue.reduce(
    (summary, item) => {
      if (item._status === 'failed') {
        summary.failed += 1;
      } else {
        summary.queued += 1;
      }
      summary.total += 1;
      summary.maxRetries = Math.max(summary.maxRetries, item._retries || 0);
      return summary;
    },
    { total: 0, queued: 0, failed: 0, maxRetries: 0 }
  );
};
