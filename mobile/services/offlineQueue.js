import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import api from './api';

const QUEUE_KEY = 'offline_queue';
const MAX_RETRIES = 3;

const getQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
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
  });
  await setQueue(queue);
};

export const flushQueue = async () => {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;

  const queue = await getQueue();
  if (queue.length === 0) return;

  const remaining = [];

  for (const item of queue) {
    try {
      const config = { ...item };
      delete config._id;
      delete config._retries;

      const method = config.method || 'post';
      await api({
        method,
        url: config.url,
        data: config.data,
        headers: config.headers || {},
      });
    } catch (err) {
      const retries = (item._retries || 0) + 1;
      if (retries < MAX_RETRIES) {
        remaining.push({ ...item, _retries: retries });
      } else {
        console.error('[OfflineQueue] Failed after 3 retries:', item.url, err.message);
      }
    }
  }

  await setQueue(remaining);
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
