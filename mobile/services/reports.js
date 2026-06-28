import api, { API_BASE_URL } from './api';

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

export const normalizeReport = (report) => {
  const beforeUrls = (report.photoUrls?.before || []).map(resolveMediaUrl).filter(Boolean);
  const afterUrls = (report.photoUrls?.after || []).map(resolveMediaUrl).filter(Boolean);
  const thumbnailUrl = resolveMediaUrl(report.thumbnailUrl) || beforeUrls[0] || afterUrls[0] || null;

  return {
    ...report,
    id: report.id || report._id || report.reportId,
    trackingId: report.trackingId || report.reportId,
    locationName:
      report.locationName ||
      report.address ||
      report.ward?.name ||
      'Reported location',
    photoUrls: {
      before: beforeUrls,
      after: afterUrls,
    },
    thumbnailUrl,
  };
};

const normalizeReportsResponse = (data) => ({
  reports: (data.reports || []).map(normalizeReport),
  pagination: data.pagination || null,
});

export const fetchCommunityReports = async (params = {}) => {
  const response = await api.get('/reports', { params });
  return normalizeReportsResponse(response.data);
};

export const fetchMyReports = async (params = {}) => {
  const response = await api.get('/reports/mine', { params });
  return normalizeReportsResponse(response.data);
};

export const upvoteReport = async (report) => {
  const reportId = report.reportId || report.trackingId || report.id;
  const response = await api.post(`/reports/${reportId}/upvote`);
  return response.data;
};
