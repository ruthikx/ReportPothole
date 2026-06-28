const { serializePublicEvent } = require('./ticketEvents');
const { generatePresignedUrl } = require('./uploadStorage');

const STATUS_LABELS = {
  open: 'Pending',
  assigned: 'In Review',
  in_progress: 'In Review',
  resolved: 'Fixed',
};

const serializeWard = (ward) => {
  if (!ward) return null;

  return {
    id: ward._id,
    name: ward.name,
  };
};

const serializeLocation = (location) => {
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;

  const [longitude, latitude] = coordinates;
  return {
    type: location.type || 'Point',
    coordinates,
    latitude,
    longitude,
  };
};

const buildPhotoUrls = async (photoKeys = []) => (
  await Promise.all(photoKeys.map((photo) => generatePresignedUrl(photo)))
).filter(Boolean);

const serializePublicReport = async (ticket, history = []) => {
  const beforePhotoUrls = await buildPhotoUrls(ticket.photos?.before || []);
  const afterPhotoUrls = await buildPhotoUrls(ticket.photos?.after || []);
  const ward = serializeWard(ticket.ward);
  const location = serializeLocation(ticket.location);

  return {
    id: ticket._id,
    _id: ticket._id,
    reportId: ticket.reportId,
    trackingId: ticket.reportId,
    status: ticket.status,
    statusLabel: STATUS_LABELS[ticket.status] || ticket.status,
    ward,
    address: ticket.address,
    location,
    locationName: ticket.address || ward?.name || 'Reported location',
    photos: ticket.photos,
    photoUrls: {
      before: beforePhotoUrls,
      after: afterPhotoUrls,
    },
    thumbnailUrl: beforePhotoUrls[0] || afterPhotoUrls[0] || null,
    description: ticket.description,
    upvotes: ticket.upvotes,
    slaDeadline: ticket.slaDeadline,
    escalationLevel: ticket.escalationLevel,
    resolvedAt: ticket.resolvedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    history: history.map(serializePublicEvent),
  };
};

module.exports = { serializePublicReport };
