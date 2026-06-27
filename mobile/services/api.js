import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const configuredApiBaseUrl =
  Constants.expoConfig?.extra?.API_BASE_URL || 'http://localhost:3000/api/v1';

const getExpoHost = () => {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost;

  return hostUri?.split(':')[0];
};

const resolveApiBaseUrl = (baseUrl) => {
  try {
    const url = new URL(baseUrl);
    const expoHost = getExpoHost();

    if (expoHost && ['localhost', '127.0.0.1'].includes(url.hostname)) {
      url.hostname = expoHost;
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    return baseUrl;
  }
};

export const API_BASE_URL = resolveApiBaseUrl(configuredApiBaseUrl);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('jwt_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // ignore storage errors
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        await AsyncStorage.removeItem('jwt_token');
      } catch {
        // ignore
      }
    }
    return Promise.reject(error);
  }
);

export default api;
