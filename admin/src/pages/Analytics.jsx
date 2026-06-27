import { useEffect, useState } from 'react';
import api from '../api.js';

export default function Analytics() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/dashboard/stats').then((res) => setStats(res.data)).catch(() => setStats(null));
  }, []);

  if (!stats) return <section className="page empty-state">Loading analytics...</section>;

  return (
    <section className="page stats-grid">
      <article><span>Total</span><strong>{stats.totalReports}</strong></article>
      <article><span>Resolved</span><strong>{stats.resolved}</strong></article>
      <article><span>Pending</span><strong>{stats.pending}</strong></article>
      <article><span>Avg fix</span><strong>{stats.averageFixTimeDays}d</strong></article>
    </section>
  );
}
