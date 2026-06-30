import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  TicketCheck,
  Wrench,
} from 'lucide-react';
import {
  API_BASE_URL,
  getDashboardStats,
  getOpenTicketMapData,
  getRecentReports,
  getReportStatus,
  getWardStats,
} from './api.js';
import pathholeLogo from './assets/pathhole-logo.jpg';

const DEFAULT_MAP_STYLE = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const MAPLIBRE_STYLE = import.meta.env.VITE_MAPLIBRE_STYLE_URL || DEFAULT_MAP_STYLE;

const EMPTY_STATS = {
  totalReports: 0,
  totalReportsThisMonth: 0,
  resolved: 0,
  pending: 0,
  open: 0,
  assigned: 0,
  inProgress: 0,
  overdue: 0,
  resolutionRate: 0,
  averageFixTimeDays: 0,
};

const statusLabels = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
};

const formatNumber = (value) => new Intl.NumberFormat().format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const normalizeStatus = (status) => statusLabels[status] || status || 'Unknown';

const relativeTime = (value) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes || 1} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  return formatDate(value);
};

const getTicketImage = (ticket) => (
  ticket?.thumbnailUrl ||
  ticket?.photoUrls?.before?.[0] ||
  ticket?.photoUrls?.after?.[0] ||
  null
);

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status || 'unknown'}`}>{normalizeStatus(status)}</span>;
}

function TicketThumbnail({ src, alt, size = 'medium' }) {
  return src ? (
    <img className={`ticket-thumb ticket-thumb-${size}`} src={src} alt={alt} loading="lazy" />
  ) : (
    <span className={`ticket-thumb-placeholder ticket-thumb-${size}`}>No image</span>
  );
}

function StatCard({ icon: Icon, label, value, detail, tone }) {
  return (
    <article className={`stat-card ${tone ? `stat-card-${tone}` : ''}`}>
      <div className="stat-icon" aria-hidden="true">
        <Icon size={20} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </article>
  );
}

function RatioBar({ resolved, pending }) {
  const total = resolved + pending;
  const resolvedPercent = total ? Math.round((resolved / total) * 100) : 0;
  const pendingPercent = total ? 100 - resolvedPercent : 0;

  return (
    <div className="ratio-panel">
      <div className="ratio-header">
        <div>
          <span>Resolved vs pending</span>
          <strong>{resolvedPercent}% resolved</strong>
        </div>
        <TicketCheck size={22} aria-hidden="true" />
      </div>
      <div className="ratio-track" aria-label={`${resolvedPercent}% resolved, ${pendingPercent}% pending`}>
        <span className="ratio-resolved" style={{ width: `${resolvedPercent}%` }} />
        <span className="ratio-pending" style={{ width: `${pendingPercent}%` }} />
      </div>
      <div className="ratio-legend">
        <span><i className="legend-dot resolved" />{formatNumber(resolved)} resolved</span>
        <span><i className="legend-dot pending" />{formatNumber(pending)} pending</span>
      </div>
    </div>
  );
}

function MapLibreTicketMap({ collection, features }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || features.length === 0) {
      return undefined;
    }

    const firstPoint = features[0].geometry.coordinates;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAPLIBRE_STYLE,
      center: firstPoint,
      zoom: 11,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource('open-tickets', {
        type: 'geojson',
        data: collection,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 42,
      });

      map.addLayer({
        id: 'open-ticket-clusters',
        type: 'circle',
        source: 'open-tickets',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#22c55e',
            10,
            '#eab308',
            25,
            '#f97316',
            50,
            '#dc2626',
          ],
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 25, 30, 50, 38],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.92,
        },
      });

      map.addLayer({
        id: 'open-ticket-cluster-count',
        type: 'symbol',
        source: 'open-tickets',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'open-ticket-points',
        type: 'circle',
        source: 'open-tickets',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'upvotes'], 1],
            1,
            5,
            10,
            12,
          ],
          'circle-color': [
            'match',
            ['get', 'status'],
            'open',
            '#dc2626',
            'assigned',
            '#f59e0b',
            'in_progress',
            '#0891b2',
            '#475569',
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.8,
          'circle-opacity': 0.9,
        },
      });

      const bounds = new maplibregl.LngLatBounds();
      features.forEach((feature) => bounds.extend(feature.geometry.coordinates));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 13 });
      }
    });

    map.on('click', 'open-ticket-clusters', (event) => {
      const feature = event.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      const source = map.getSource('open-tickets');

      if (clusterId == null || !source?.getClusterExpansionZoom) return;

      source
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          map.easeTo({
            center: feature.geometry.coordinates,
            zoom,
          });
        })
        .catch(() => {});
    });

    map.on('click', 'open-ticket-points', (event) => {
      const feature = event.features?.[0];
      if (!feature) return;

      const coordinates = feature.geometry.coordinates.slice();
      const { reportId, status, ward, upvotes, address, thumbnailUrl, locationName } = feature.properties;
      const imageHtml = thumbnailUrl
        ? `<img class="map-popup-image" src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(
            reportId ? `Pothole report ${reportId}` : 'Pothole report image'
          )}" />`
        : '';

      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(
          `<div class="map-popup-card">${imageHtml}<strong>${escapeHtml(
            reportId || 'Unlabeled report'
          )}</strong><span>${escapeHtml(address || locationName || 'Address not provided')}</span><small>${escapeHtml(
            normalizeStatus(status)
          )} &middot; ${escapeHtml(ward || 'Unassigned')} ward &middot; ${formatNumber(upvotes)} upvotes</small></div>`
        )
        .addTo(map);
    });

    ['open-ticket-clusters', 'open-ticket-points'].forEach((layerId) => {
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [collection, features]);

  return <div className="map-canvas" ref={containerRef} aria-label="Open ticket MapLibre map" />;
}

function RecentReportsCard({ reports, activeCount }) {
  const recentReports = useMemo(() => {
    return [...reports]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 4);
  }, [reports]);

  return (
    <section className="dashboard-section report-card-panel">
      <div className="section-heading compact-heading">
        <h2>Recent Reports</h2>
        <span>{formatNumber(activeCount)} active</span>
      </div>
      {recentReports.length === 0 ? (
        <p className="empty-state compact-empty">No recent open reports are available.</p>
      ) : (
        <div className="recent-report-list">
          {recentReports.map((report) => {
            const imageUrl = getTicketImage(report);
            const wardName = report.wardName || report.ward?.name || 'Unassigned';

            return (
              <article className="recent-report-row" key={report.id || report.reportId}>
                <TicketThumbnail
                  src={imageUrl}
                  alt={`Pothole report ${report.reportId || 'image'}`}
                  size="medium"
                />
                <div className="recent-report-copy">
                  <strong>{report.address || report.locationName || report.reportId || 'Reported location'}</strong>
                  <span><MapPin size={13} aria-hidden="true" />{wardName}</span>
                </div>
                <div className="recent-report-meta">
                  <StatusBadge status={report.status} />
                  <small>{relativeTime(report.createdAt)}</small>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StatusSummary({ stats }) {
  const items = [
    {
      label: 'Open',
      value: stats.open,
      className: 'open',
      icon: AlertTriangle,
    },
    {
      label: 'Assigned',
      value: stats.assigned,
      className: 'assigned',
      icon: TicketCheck,
    },
    {
      label: 'In progress',
      value: stats.inProgress,
      className: 'in-progress',
      icon: Wrench,
    },
  ];

  return (
    <div className="status-summary" aria-label="Ticket status summary">
      {items.map(({ label, value, className, icon: Icon }) => (
        <article className={`status-summary-card status-summary-${className}`} key={label}>
          <span aria-hidden="true"><Icon size={18} /></span>
          <div>
            <small>{label}</small>
            <strong>{formatNumber(value)}</strong>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReportsMapRow({ collection, reports, stats }) {
  const features = useMemo(() => {
    return (collection?.features || []).filter(
      (feature) =>
        feature?.geometry?.type === 'Point' &&
        Array.isArray(feature.geometry.coordinates) &&
        feature.geometry.coordinates.length === 2
    );
  }, [collection]);

  const mapCollection = useMemo(() => ({ type: 'FeatureCollection', features }), [features]);
  const shouldShowMap = features.length > 0;

  return (
    <section className="reports-map-row" aria-label="Recent reports and pothole map">
      <RecentReportsCard reports={reports} activeCount={features.length || reports.length} />
      <div className="map-column">
        <section className="dashboard-section map-card-panel">
          <div className="section-heading compact-heading">
            <h2>Pothole Map</h2>
            <span>{formatNumber(features.length)} locations</span>
          </div>
          {shouldShowMap ? (
            <MapLibreTicketMap collection={mapCollection} features={features} />
          ) : (
            <div className="map-empty-state">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>No open tickets have coordinates for the map.</span>
            </div>
          )}
        </section>
        <StatusSummary stats={stats} />
      </div>
    </section>
  );
}

function WardTable({ wards }) {
  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Ward performance</span>
          <h2>Resolution table</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ward</th>
              <th>Total</th>
              <th>Open</th>
              <th>Assigned</th>
              <th>In progress</th>
              <th>Resolved</th>
              <th>Pending</th>
              <th>Resolution</th>
            </tr>
          </thead>
          <tbody>
            {wards.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty-cell">No ward statistics are available.</td>
              </tr>
            ) : (
              wards.map((ward) => (
                <tr key={ward._id}>
                  <td><strong>{ward._id}</strong></td>
                  <td>{formatNumber(ward.total)}</td>
                  <td>{formatNumber(ward.open)}</td>
                  <td>{formatNumber(ward.assigned)}</td>
                  <td>{formatNumber(ward.inProgress)}</td>
                  <td>{formatNumber(ward.resolved)}</td>
                  <td>{formatNumber(ward.pending)}</td>
                  <td>
                    <div className="table-rate">
                      <span>{ward.resolutionRate || 0}%</span>
                      <i style={{ width: `${Math.min(100, Math.max(0, ward.resolutionRate || 0))}%` }} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LookupPanel() {
  const [reportId, setReportId] = useState('');
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = reportId.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    setTicket(null);

    try {
      const result = await getReportStatus(trimmed);
      setTicket(result);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to find that report ID.');
    } finally {
      setLoading(false);
    }
  };

  const beforeImages = ticket?.photoUrls?.before || [];
  const afterImages = ticket?.photoUrls?.after || [];
  const hasImages = beforeImages.length > 0 || afterImages.length > 0;

  return (
    <section className="dashboard-section lookup-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Public lookup</span>
          <h2>Report status</h2>
        </div>
      </div>
      <form className="lookup-form" onSubmit={submit}>
        <label htmlFor="reportId">Report ID</label>
        <div className="lookup-controls">
          <input
            id="reportId"
            placeholder="RPT-00001"
            value={reportId}
            onChange={(event) => setReportId(event.target.value)}
          />
          <button type="submit" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
            <span>Look up</span>
          </button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}
      {ticket && (
        <article className="status-result">
          <div className="status-result-head">
            <div>
              <span>{ticket.reportId}</span>
              <strong>{ticket.address || ticket.locationName || ticket.ward?.name || 'Reported location'}</strong>
            </div>
            <StatusBadge status={ticket.status} />
          </div>
          {hasImages && (
            <div className="status-gallery" aria-label="Report images">
              {beforeImages.map((src, index) => (
                <figure key={`before-${src}`}>
                  <img src={src} alt={`Before repair for ${ticket.reportId}`} loading="lazy" />
                  <figcaption>Before {beforeImages.length > 1 ? index + 1 : ''}</figcaption>
                </figure>
              ))}
              {afterImages.map((src, index) => (
                <figure key={`after-${src}`}>
                  <img src={src} alt={`After repair for ${ticket.reportId}`} loading="lazy" />
                  <figcaption>After {afterImages.length > 1 ? index + 1 : ''}</figcaption>
                </figure>
              ))}
            </div>
          )}
          <dl>
            <div>
              <dt>Address</dt>
              <dd>{ticket.address || ticket.locationName || 'Address not provided'}</dd>
            </div>
            <div>
              <dt>Ward</dt>
              <dd>{ticket.ward?.name || 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Assigned to</dt>
              <dd>{ticket.assignedTo?.name || 'Not assigned'}</dd>
            </div>
            <div>
              <dt>Reported</dt>
              <dd>{formatDate(ticket.createdAt)}</dd>
            </div>
            <div>
              <dt>SLA deadline</dt>
              <dd>{formatDate(ticket.slaDeadline)}</dd>
            </div>
            <div>
              <dt>Upvotes</dt>
              <dd>{formatNumber(ticket.upvotes)}</dd>
            </div>
            <div>
              <dt>Resolved</dt>
              <dd>{formatDate(ticket.resolvedAt)}</dd>
            </div>
          </dl>
        </article>
      )}
    </section>
  );
}

export default function App() {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [ticketMap, setTicketMap] = useState({ type: 'FeatureCollection', features: [] });
  const [recentReports, setRecentReports] = useState([]);
  const [wards, setWards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError('');

    try {
      const [nextStats, nextTicketMap, nextWards, nextRecentReports] = await Promise.all([
        getDashboardStats(),
        getOpenTicketMapData(),
        getWardStats(),
        getRecentReports(4).catch(() => []),
      ]);

      setStats({ ...EMPTY_STATS, ...nextStats });
      setTicketMap(nextTicketMap || { type: 'FeatureCollection', features: [] });
      setRecentReports(nextRecentReports);
      setWards(nextWards);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err.response?.data?.error || `Unable to load dashboard data from ${API_BASE_URL}.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <main className="app-shell">
      <header className="dashboard-header">
        <div className="brand-block">
          <img
            className="brand-art"
            src={pathholeLogo}
            alt="PathHole road marker over a pothole"
          />
          <div className="brand-copy">
            <span className="eyebrow">Public dashboard</span>
            <h1>PathHole command view</h1>
            <p>Live road repair signal for report volume, resolution momentum, ward performance, and public ticket lookup.</p>
            <div className="header-tags" aria-label="Dashboard signals">
              <span><MapPin size={15} aria-hidden="true" /> Citywide road watch</span>
              <span><TicketCheck size={15} aria-hidden="true" /> Spot it. Report it. Fix it.</span>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <div className="sync-panel" aria-live="polite">
            <span>Latest sync</span>
            <strong>{updatedAt ? formatDate(updatedAt) : 'Waiting for data'}</strong>
          </div>
          <button type="button" className="refresh-button" onClick={loadDashboard} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      <section className="metric-grid" aria-label="Dashboard summary">
        <StatCard
          icon={BarChart3}
          label="Reports this month"
          value={loading ? '...' : formatNumber(stats.totalReportsThisMonth)}
          detail={`${formatNumber(stats.totalReports)} all-time reports`}
          tone="blue"
        />
        <StatCard
          icon={CheckCircle2}
          label="Resolution rate"
          value={loading ? '...' : `${stats.resolutionRate || 0}%`}
          detail={`${formatNumber(stats.resolved)} reports resolved`}
          tone="green"
        />
        <StatCard
          icon={Clock3}
          label="Average fix time"
          value={loading ? '...' : `${stats.averageFixTimeDays || 0} days`}
          detail="Resolved reports from the last 30 days"
          tone="amber"
        />
        <StatCard
          icon={MapPin}
          label="Overdue open work"
          value={loading ? '...' : formatNumber(stats.overdue)}
          detail={`${formatNumber(stats.open)} open, ${formatNumber(stats.assigned)} assigned`}
          tone="red"
        />
      </section>

      <section className="dashboard-grid">
        <RatioBar resolved={stats.resolved || 0} pending={stats.pending || 0} />
        <LookupPanel />
      </section>

      <ReportsMapRow collection={ticketMap} reports={recentReports} stats={stats} />
      <WardTable wards={wards} />

      <footer>
        <span>API: {API_BASE_URL}</span>
        <span>{updatedAt ? `Updated ${formatDate(updatedAt)}` : 'Waiting for data'}</span>
      </footer>
    </main>
  );
}
