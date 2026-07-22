import { useEffect, useState } from 'react';
import { MapPin, UserPlus } from 'lucide-react';
import api, { resolveMediaUrl } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { inferWardName } from '../wardNames.js';

const getTicketThumbnail = (ticket) => (
  resolveMediaUrl(ticket?.thumbnailUrl) ||
  resolveMediaUrl(ticket?.photoUrls?.before?.[0]) ||
  resolveMediaUrl(ticket?.photoUrls?.after?.[0])
);

export default function Assign({ ticket, onDone }) {
  const [workers, setWorkers] = useState([]);
  const [workerId, setWorkerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingWorkers, setLoadingWorkers] = useState(false);

  useEffect(() => {
    if (!ticket) return;
    setLoadingWorkers(true);
    setWorkerId('');
    api.get('/tickets/meta/workers', { params: ticket.ward?._id ? { ward: ticket.ward._id } : {} })
      .then((res) => setWorkers(res.data.workers || []))
      .catch(() => setWorkers([]))
      .finally(() => setLoadingWorkers(false));
  }, [ticket]);

  const assign = async () => {
    if (!ticket || !workerId) return;
    setLoading(true);
    try {
      await api.patch(`/tickets/${ticket._id}/assign`, { workerId });
      onDone?.();
    } finally {
      setLoading(false);
    }
  };

  if (!ticket) return <section className="page empty-state">Select a ticket from the queue.</section>;

  const thumbnailUrl = getTicketThumbnail(ticket);
  const ticketWardName = ticket.wardName || ticket.ward?.name || inferWardName(ticket.address, ticket.description);

  return (
    <section className="page">
      <div className="detail-card">
        <div className="ticket-detail">
          {thumbnailUrl ? (
            <img
              className="ticket-detail-image"
              src={thumbnailUrl}
              alt={`Pothole report ${ticket.reportId}`}
            />
          ) : (
            <div className="ticket-detail-image placeholder">No image</div>
          )}
          <div className="ticket-detail-copy">
            <div className="ticket-detail-heading">
              <div>
                <span className="eyebrow">Selected report</span>
                <h2>{ticket.reportId}</h2>
              </div>
              <StatusBadge status={ticket.status} />
            </div>
            <p>{ticket.description || 'No public note'}</p>
            <div className="detail-stack">
              <div className="row">
                <MapPin size={17} aria-hidden="true" />
                <div><strong>Address</strong><span>{ticket.address || 'No address provided'}</span></div>
              </div>
              <div className="row">
                <MapPin size={17} aria-hidden="true" />
                <div><strong>Ward</strong><span>{ticketWardName || 'Unassigned'}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="toolbar assignment-toolbar">
        <label>
          <span>Field worker or crew</span>
          <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} disabled={loadingWorkers || workers.length === 0}>
            <option value="">
              {loadingWorkers ? 'Loading field workers...' : 'Select a field worker'}
            </option>
            {workers.map((worker) => (
              <option key={worker._id} value={worker._id}>
                {worker.name}
                {worker.wardName || worker.ward?.name ? ` - ${worker.wardName || worker.ward?.name}` : ''}
                {worker.phone ? ` (${worker.phone})` : ''}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!workerId || loading} onClick={assign}>
          <UserPlus size={18} />
          <span>{loading ? 'Assigning...' : 'Assign report'}</span>
        </button>
      </div>
      {!loadingWorkers && workers.length === 0 && (
        <div className="empty-state">
          No field workers found for {ticketWardName || 'this ticket'}. Add a worker or crew in Settings.
        </div>
      )}
    </section>
  );
}
