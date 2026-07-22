const LABELS = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status || 'unknown'}`}>
      {LABELS[status] || status || 'Unknown'}
    </span>
  );
}
