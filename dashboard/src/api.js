import axios from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL.replace(/\/$/, ''),
  timeout: 30000,
});

export const getDashboardStats = async () => {
  const response = await api.get('/dashboard/stats');
  return response.data;
};

export const getOpenTicketMapData = async () => {
  const response = await api.get('/dashboard/heatmap');
  return response.data;
};

export const getWardStats = async () => {
  const response = await api.get('/dashboard/wards');
  return response.data.wards || [];
};

export const getReportStatus = async (reportId) => {
  const response = await api.get(`/dashboard/status/${encodeURIComponent(reportId)}`);
  return response.data;
};

export default api;
