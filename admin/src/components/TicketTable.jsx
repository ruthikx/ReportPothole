import StatusBadge from './StatusBadge.jsx';
import SlaBadge from './SlaBadge.jsx';
import { resolveMediaUrl } from '../api.js';
import { inferWardName } from '../wardNames.js';

const getTicketThumbnail = (ticket) => (
  resolveMediaUrl(ticket.thumbnailUrl) ||
  resolveMediaUrl(ticket.photoUrls?.before?.[0]) ||
  resolveMediaUrl(ticket.photoUrls?.after?.[0])
);

export default function TicketTable({ tickets, onSelect, emptyLabel = 'No tickets found' }) {
  if (!tickets.length) {
    return <div className="empty-state">{emptyLabel}</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Image</th>
            <th>Report</th>
            <th>Address</th>
            <th>Ward</th>
            <th>Status</th>
            <th>Assigned</th>
            <th>SLA</th>
            <th>Esc.</th>
            <th>Upvotes</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => {
            const thumbnailUrl = getTicketThumbnail(ticket);
            const wardName = ticket.wardName || ticket.ward?.name || inferWardName(ticket.address, ticket.description);

            return (
              <tr key={ticket._id} onClick={() => onSelect?.(ticket)}>
                <td>
                  {thumbnailUrl ? (
                    <img
                      className="ticket-thumb"
                      src={thumbnailUrl}
                      alt={`Pothole report ${ticket.reportId}`}
                      loading="lazy"
                    />
                  ) : (
                    <span className="ticket-thumb-placeholder">No image</span>
                  )}
                </td>
                <td>
                  <strong>{ticket.reportId}</strong>
                  <span>{ticket.description || 'No public note'}</span>
                </td>
                <td>
                  <span className="address-cell">{ticket.address || 'No address provided'}</span>
                </td>
                <td>{wardName || 'Unassigned'}</td>
                <td><StatusBadge status={ticket.status} /></td>
                <td>{ticket.assignedTo?.name || 'None'}</td>
                <td><SlaBadge deadline={ticket.slaDeadline} /></td>
                <td>L{ticket.escalationLevel || 0}</td>
                <td>{ticket.upvotes || 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
