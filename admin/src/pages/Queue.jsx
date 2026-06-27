import { useEffect, useMemo, useState } from 'react';
import api from '../api.js';
import TicketTable from '../components/TicketTable.jsx';

const STATUS_FILTERS = ['', 'open', 'assigned', 'in_progress', 'resolved'];

export default function Queue({ onSelectTicket }) {
  const [tickets, setTickets] = useState([]);
  const [wards, setWards] = useState([]);
  const [status, setStatus] = useState('');
  const [ward, setWard] = useState('');
  const [loading, setLoading] = useState(false);

  const query = useMemo(
    () => ({ status: status || undefined, ward: ward || undefined, limit: 100 }),
    [status, ward]
  );

  useEffect(() => {
    let mounted = true;
    api
      .get('/tickets/meta/wards')
      .then((res) => mounted && setWards(res.data.wards || []))
      .catch(() => mounted && setWards([]));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api
      .get('/tickets', { params: query })
      .then((res) => mounted && setTickets(res.data.tickets || []))
      .catch(() => mounted && setTickets([]))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [query]);

  return (
    <section className="page">
      <div className="toolbar">
        <div className="filters">
          {STATUS_FILTERS.map((value) => (
            <button
              key={value || 'all'}
              className={status === value ? 'chip active' : 'chip'}
              onClick={() => setStatus(value)}
              type="button"
            >
              {value || 'All'}
            </button>
          ))}
        </div>
        <select value={ward} onChange={(e) => setWard(e.target.value)}>
          <option value="">All wards</option>
          {wards.map((item) => (
            <option key={item._id} value={item._id}>{item.name}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <div className="empty-state">Loading queue...</div>
      ) : (
        <TicketTable tickets={tickets} onSelect={onSelectTicket} />
      )}
    </section>
  );
}
