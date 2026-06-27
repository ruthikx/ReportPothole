import { useEffect, useState } from 'react';
import api from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Assign({ ticket, onDone }) {
  const [workers, setWorkers] = useState([]);
  const [workerId, setWorkerId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticket) return;
    api.get('/tickets/meta/workers', { params: ticket.ward?._id ? { ward: ticket.ward._id } : {} })
      .then((res) => setWorkers(res.data.workers || []))
      .catch(() => setWorkers([]));
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

  return (
    <section className="page">
      <div className="detail-card">
        <h2>{ticket.reportId}</h2>
        <StatusBadge status={ticket.status} />
        <p>{ticket.description || ticket.address || 'No public note'}</p>
        <div className="row">
          <strong>Ward:</strong> <span>{ticket.ward?.name || 'Unassigned'}</span>
        </div>
      </div>
      <div className="toolbar">
        <select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
          <option value="">Select a worker</option>
          {workers.map((worker) => (
            <option key={worker._id} value={worker._id}>{worker.name} {worker.phone ? `(${worker.phone})` : ''}</option>
          ))}
        </select>
        <button disabled={!workerId || loading} onClick={assign}>Assign</button>
      </div>
    </section>
  );
}
