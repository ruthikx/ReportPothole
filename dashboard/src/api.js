import axios from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL.replace(/\/$/, ''),
  timeout: 30000,
});

const getApiOrigin = () => {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return API_BASE_URL.replace(/\/api(?:\/v\d+)?\/?$/, '');
  }
};

export const resolveMediaUrl = (value) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  try {
    return new URL(value, getApiOrigin()).toString();
  } catch {
    return value;
  }
};

export const normalizeReportMedia = (report) => {
  const beforeUrls = (report?.photoUrls?.before || []).map(resolveMediaUrl).filter(Boolean);
  const afterUrls = (report?.photoUrls?.after || []).map(resolveMediaUrl).filter(Boolean);
  const thumbnailUrl = resolveMediaUrl(report?.thumbnailUrl) || beforeUrls[0] || afterUrls[0] || null;

  return {
    ...report,
    locationName: report?.locationName || report?.address || report?.ward?.name || 'Reported location',
    photoUrls: {
      before: beforeUrls,
      after: afterUrls,
    },
    thumbnailUrl,
  };
};

const normalizeFeatureMedia = (feature) => {
  const props = feature?.properties || {};

  return {
    ...feature,
    properties: normalizeReportMedia(props),
  };
};

export const getDashboardStats = async () => {
  const response = await api.get('/dashboard/stats');
  return response.data;
};

export const getOpenTicketMapData = async () => {
  const response = await api.get('/dashboard/heatmap');
  return {
    ...response.data,
    features: (response.data?.features || []).map(normalizeFeatureMedia),
  };
};

export const getRecentReports = async (limit = 4) => {
  const response = await api.get('/reports', {
    params: {
      limit,
      status: 'open,assigned,in_progress',
    },
  });

  return (response.data?.reports || []).map(normalizeReportMedia);
};

export const getWardStats = async () => {
  const response = await api.get('/dashboard/wards');
  return response.data.wards || [];
};

export const getReportStatus = async (reportId) => {
  const response = await api.get(`/dashboard/status/${encodeURIComponent(reportId)}`);
  return normalizeReportMedia(response.data);
};

export default api;
