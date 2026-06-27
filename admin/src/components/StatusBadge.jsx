const COLORS = {
  open: '#6b7280',
  assigned: '#2563eb',
  in_progress: '#d97706',
  resolved: '#059669',
};

const LABELS = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

export default function StatusBadge({ status }) {
  return (
    <span className="status-badge" style={{ backgroundColor: COLORS[status] || '#6b7280' }}>
      {LABELS[status] || status || 'Unknown'}
    </span>
  );
}
