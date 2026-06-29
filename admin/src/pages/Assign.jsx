import { useEffect, useState } from 'react';
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
          <div>
            <h2>{ticket.reportId}</h2>
            <StatusBadge status={ticket.status} />
            <p>{ticket.description || 'No public note'}</p>
            <div className="detail-stack">
              <div className="row">
                <strong>Address:</strong> <span>{ticket.address || 'No address provided'}</span>
              </div>
              <div className="row">
                <strong>Ward:</strong> <span>{ticketWardName || 'Unassigned'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="toolbar">
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
        <button disabled={!workerId || loading} onClick={assign}>Assign</button>
      </div>
      {!loadingWorkers && workers.length === 0 && (
        <div className="empty-state">
          No field workers found for {ticketWardName || 'this ticket'}. Add a worker or crew in Settings.
        </div>
      )}
    </section>
  );
}
