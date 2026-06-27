import StatusBadge from './StatusBadge.jsx';
import SlaBadge from './SlaBadge.jsx';

export default function TicketTable({ tickets, onSelect, emptyLabel = 'No tickets found' }) {
  if (!tickets.length) {
    return <div className="empty-state">{emptyLabel}</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Report</th>
            <th>Ward</th>
            <th>Status</th>
            <th>Assigned</th>
            <th>SLA</th>
            <th>Esc.</th>
            <th>Upvotes</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket._id} onClick={() => onSelect?.(ticket)}>
              <td>
                <strong>{ticket.reportId}</strong>
                <span>{ticket.description || ticket.address || 'No public note'}</span>
              </td>
              <td>{ticket.ward?.name || 'Unassigned'}</td>
              <td><StatusBadge status={ticket.status} /></td>
              <td>{ticket.assignedTo?.name || 'None'}</td>
              <td><SlaBadge deadline={ticket.slaDeadline} /></td>
              <td>L{ticket.escalationLevel || 0}</td>
              <td>{ticket.upvotes || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
