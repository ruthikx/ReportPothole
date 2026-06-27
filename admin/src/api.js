import axios from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL.replace(/\/$/, ''),
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pothole_admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
