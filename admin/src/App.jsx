import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  LogIn,
  LogOut,
  Settings,
  ShieldCheck,
  TicketCheck,
  UserPlus,
} from 'lucide-react';
import api from './api.js';
import Queue from './pages/Queue.jsx';
import Assign from './pages/Assign.jsx';
import Escalations from './pages/Escalations.jsx';
import Analytics from './pages/Analytics.jsx';
import SettingsPage from './pages/Settings.jsx';
import pathholeLogo from './assets/pathhole-logo.jpg';

const NAV_ITEMS = [
  {
    id: 'queue',
    label: 'Queue',
    icon: ClipboardList,
    description: 'Review and route every incoming road report.',
  },
  {
    id: 'assign',
    label: 'Assign',
    icon: UserPlus,
    description: 'Send selected work to the right field crew.',
  },
  {
    id: 'escalations',
    label: 'Escalations',
    icon: AlertTriangle,
    description: 'Prioritize tickets that have crossed their SLA.',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    description: 'Monitor repair volume, pace, and resolution health.',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    description: 'Manage wards, field workers, and staff access.',
  },
];
const ADMIN_ROLES = ['engineer', 'supervisor', 'commissioner', 'admin'];

const loadStoredAdminUser = () => {
  try {
    const user = JSON.parse(localStorage.getItem('pothole_admin_user') || 'null');
    return user && ADMIN_ROLES.includes(user.role) ? user : null;
  } catch {
    return null;
  }
};

const clearStoredAdminSession = () => {
  localStorage.removeItem('pothole_admin_token');
  localStorage.removeItem('pothole_admin_user');
};

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/admin/login', { email, password });
      if (!ADMIN_ROLES.includes(res.data.user?.role)) {
        throw new Error('This account does not have admin portal access');
      }
      localStorage.setItem('pothole_admin_token', res.data.token);
      localStorage.setItem('pothole_admin_user', JSON.stringify(res.data.user));
      onLogin(res.data.user);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-visual" aria-label="PathHole road operations">
        <div className="login-brand">
          <img src={pathholeLogo} alt="" />
          <span><strong>PathHole</strong><small>Road command</small></span>
        </div>
        <div className="login-visual-copy">
          <span className="eyebrow">Municipal operations</span>
          <h2>Keep every repair moving.</h2>
          <p>Coordinate road reports, field assignments, escalations, and ward performance from one live console.</p>
          <div className="header-tags">
            <span><i /> Operations online</span>
            <span><ShieldCheck size={14} aria-hidden="true" /> Staff access</span>
          </div>
        </div>
      </section>
      <form className="login-panel" onSubmit={submit}>
        <div className="login-heading">
          <span className="eyebrow">Municipal staff</span>
          <h1>Admin sign in</h1>
          <p>Use your authorized PathHole staff account.</p>
        </div>
        <label>
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            placeholder="name@city.gov"
            required
          />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Enter your password"
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={loading}>
          <LogIn size={18} />
          <span>{loading ? 'Signing in...' : 'Sign in'}</span>
        </button>
      </form>
    </main>
  );
}

export default function App() {
  const [active, setActive] = useState('queue');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [user, setUser] = useState(loadStoredAdminUser);
  const [hasToken, setHasToken] = useState(() => {
    const storedUser = loadStoredAdminUser();
    const hasAdminToken = Boolean(localStorage.getItem('pothole_admin_token')) && Boolean(storedUser);
    if (!hasAdminToken) clearStoredAdminSession();
    return hasAdminToken;
  });

  const activeItem = useMemo(
    () => NAV_ITEMS.find((item) => item.id === active) || NAV_ITEMS[0],
    [active]
  );

  const logout = () => {
    clearStoredAdminSession();
    setHasToken(false);
    setUser(null);
    setSelectedTicket(null);
  };

  if (!hasToken) {
    return <Login onLogin={(nextUser) => { setUser(nextUser); setHasToken(true); }} />;
  }

  return (
    <div className="admin-app">
      <aside className="desktop-sidebar">
        <button
          className="sidebar-brand"
          onClick={() => setActive('queue')}
          type="button"
          aria-label="Open the PathHole admin queue"
        >
          <img src={pathholeLogo} alt="" />
          <span><strong>PathHole</strong><small>Road command</small></span>
        </button>
        <nav className="sidebar-nav" aria-label="Admin navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={active === id ? 'nav-item active' : 'nav-item'}
              onClick={() => setActive(id)}
              type="button"
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="staff-card">
            <ShieldCheck size={20} />
            <span>
              <strong>{user?.name || 'Staff user'}</strong>
              <small>{user?.role || 'Authorized access'}</small>
            </span>
          </div>
          <button className="logout" onClick={logout} type="button">
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div className="mobile-brand">
            <img src={pathholeLogo} alt="" />
            <strong>PathHole</strong>
          </div>
          <div className="admin-header-copy">
            <span className="eyebrow">{user?.role || 'Staff access'} workspace</span>
            <h1>{activeItem.label}</h1>
            <p>{activeItem.description}</p>
            <div className="header-tags" aria-label="Admin workspace signals">
              <span><i /> Operations online</span>
              <span><ShieldCheck size={14} aria-hidden="true" /> Authorized staff</span>
            </div>
          </div>
          <div className="header-actions">
            {selectedTicket && (
              <button className="selected-ticket-button" onClick={() => setActive('assign')} type="button">
                <TicketCheck size={17} />
                <span>{selectedTicket.reportId}</span>
              </button>
            )}
            <button className="mobile-logout" onClick={logout} type="button" aria-label="Sign out" title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
          <div className="staff-panel">
            <span>Signed in as</span>
            <strong>{user?.name || user?.email || 'Staff user'}</strong>
          </div>
        </header>

        <div className="admin-content">
          {active === 'queue' && (
            <Queue
              onSelectTicket={(ticket) => {
                setSelectedTicket(ticket);
                setActive('assign');
              }}
            />
          )}
          {active === 'assign' && (
            <Assign
              ticket={selectedTicket}
              onDone={() => {
                setActive('queue');
                setSelectedTicket(null);
              }}
            />
          )}
          {active === 'escalations' && (
            <Escalations
              onSelectTicket={(ticket) => {
                setSelectedTicket(ticket);
                setActive('assign');
              }}
            />
          )}
          {active === 'analytics' && <Analytics />}
          {active === 'settings' && <SettingsPage user={user} />}
        </div>

        <footer>
          <span>PathHole municipal road command</span>
          <span>{user?.role || 'Staff'} access</span>
        </footer>
      </main>

      <nav className="mobile-nav" aria-label="Mobile admin navigation">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={active === id ? 'active' : ''}
            onClick={() => setActive(id)}
            type="button"
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
