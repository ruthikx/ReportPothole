import { useEffect, useState } from 'react';
import api from '../api.js';
import TicketTable from '../components/TicketTable.jsx';

export default function Escalations({ onSelectTicket }) {
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    api.get('/tickets/overdue')
      .then((res) => setTickets(res.data.tickets || []))
      .catch(() => setTickets([]));
  }, []);

  return (
    <section className="page">
      <TicketTable tickets={tickets} onSelect={onSelectTicket} emptyLabel="No overdue tickets." />
    </section>
  );
}
