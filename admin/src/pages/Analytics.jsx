import { useEffect, useState } from 'react';
import { BarChart3, CheckCircle2, Clock3, TicketCheck } from 'lucide-react';
import api from '../api.js';

export default function Analytics() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/dashboard/stats').then((res) => setStats(res.data)).catch(() => setStats(null));
  }, []);

  if (!stats) return <section className="page empty-state">Loading analytics...</section>;

  return (
    <section className="page stats-grid">
      <article className="stat-card stat-card-blue">
        <span className="stat-icon"><BarChart3 size={20} /></span>
        <div><span>Total reports</span><strong>{stats.totalReports}</strong><small>All recorded road reports</small></div>
      </article>
      <article className="stat-card stat-card-green">
        <span className="stat-icon"><CheckCircle2 size={20} /></span>
        <div><span>Resolved</span><strong>{stats.resolved}</strong><small>Repairs completed</small></div>
      </article>
      <article className="stat-card stat-card-amber">
        <span className="stat-icon"><TicketCheck size={20} /></span>
        <div><span>Pending</span><strong>{stats.pending}</strong><small>Reports still active</small></div>
      </article>
      <article className="stat-card stat-card-violet">
        <span className="stat-icon"><Clock3 size={20} /></span>
        <div><span>Average fix time</span><strong>{stats.averageFixTimeDays}d</strong><small>Current repair pace</small></div>
      </article>
    </section>
  );
}
