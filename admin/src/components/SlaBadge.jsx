const formatRemaining = (deadline) => {
  if (!deadline) return 'No SLA';
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return 'Overdue';
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`;
};

export default function SlaBadge({ deadline }) {
  const overdue = deadline && new Date(deadline).getTime() < Date.now();
  return <span className={`sla-badge ${overdue ? 'overdue' : ''}`}>{formatRemaining(deadline)}</span>;
}
