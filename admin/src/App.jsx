import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ClipboardList, LogOut, Settings, UserPlus } from 'lucide-react';
import api from './api.js';
import Queue from './pages/Queue.jsx';
import Assign from './pages/Assign.jsx';
import Escalations from './pages/Escalations.jsx';
import Analytics from './pages/Analytics.jsx';
import SettingsPage from './pages/Settings.jsx';

const NAV_ITEMS = [
  { id: 'queue', label: 'Queue', icon: ClipboardList },
  { id: 'assign', label: 'Assign', icon: UserPlus },
  { id: 'escalations', label: 'Escalations', icon: AlertTriangle },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
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
      <form className="login-panel" onSubmit={submit}>
        <span className="eyebrow">Municipal staff</span>
        <h1>PotholeTrack Admin</h1>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
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

  const activeLabel = useMemo(
    () => NAV_ITEMS.find((item) => item.id === active)?.label || 'Queue',
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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">PT</span>
          <div>
            <strong>PotholeTrack</strong>
            <span>Admin Console</span>
          </div>
        </div>
        <nav>
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
        <button className="logout" onClick={logout} type="button">
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">{user?.role || 'Staff access'}</span>
            <h1>{activeLabel}</h1>
          </div>
          {selectedTicket && (
            <button className="ghost-button" onClick={() => setActive('assign')} type="button">
              Selected: {selectedTicket.reportId}
            </button>
          )}
        </header>

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
      </main>
    </div>
  );
}
