import { useEffect, useState } from 'react';
import api from '../api.js';
import { KARNATAKA_WARD_NAMES, uniqueWardNames } from '../wardNames.js';

const INITIAL_WORKER_FORM = {
  name: '',
  email: '',
  phone: '',
  wardName: '',
  password: '',
};

const canManageStaff = (role) => ['supervisor', 'commissioner', 'admin'].includes(role);

export default function Settings({ user }) {
  const [wards, setWards] = useState([]);
  const [users, setUsers] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [workerForm, setWorkerForm] = useState(INITIAL_WORKER_FORM);
  const [workerError, setWorkerError] = useState('');
  const [workerMessage, setWorkerMessage] = useState('');
  const [savingWorker, setSavingWorker] = useState(false);
  const wardSuggestions = uniqueWardNames([
    ...KARNATAKA_WARD_NAMES,
    ...wards.map((ward) => ward.name),
  ]);

  const loadSettings = () => {
    const requests = [
      api.get('/admin/wards').then((res) => res.data.wards || []).catch(() => []),
      api.get('/admin/workers').then((res) => res.data.workers || []).catch(() => []),
      canManageStaff(user?.role)
        ? api.get('/admin/users').then((res) => res.data.users || []).catch(() => [])
        : Promise.resolve([]),
    ];

    return Promise.all(requests);
  };

  useEffect(() => {
    let mounted = true;

    loadSettings().then(([nextWards, nextWorkers, nextUsers]) => {
      if (!mounted) return;
      setWards(nextWards);
      setWorkers(nextWorkers);
      setUsers(nextUsers);
    });

    return () => {
      mounted = false;
    };
  }, [user?.role]);

  const updateWorkerForm = (field, value) => {
    setWorkerForm((current) => ({ ...current, [field]: value }));
  };

  const createWorker = async (event) => {
    event.preventDefault();
    setWorkerError('');
    setWorkerMessage('');
    setSavingWorker(true);

    try {
      const payload = {
        name: workerForm.name.trim(),
        email: workerForm.email.trim(),
        phone: workerForm.phone.trim() || undefined,
        wardName: workerForm.wardName.trim(),
        password: workerForm.password,
      };
      const res = await api.post('/admin/workers', payload);
      setWorkers((current) => [...current, res.data.worker].sort((a, b) => a.name.localeCompare(b.name)));
      setWorkerForm(INITIAL_WORKER_FORM);
      setWorkerMessage('Field worker added.');
    } catch (err) {
      setWorkerError(err.response?.data?.error || 'Unable to add field worker');
    } finally {
      setSavingWorker(false);
    }
  };

  return (
    <section className="page">
      <div className="settings-grid">
        <div className="detail-card">
          <h2>Wards</h2>
          <div className="stack-list">
            {wards.map((ward) => (
              <div className="list-row" key={ward._id}>
                <div>
                  <strong>{ward.name}</strong>
                  <span>{ward.assignedEngineer?.name || 'No engineer assigned'}</span>
                </div>
                <span>{ward.slaHours || 168}h SLA</span>
              </div>
            ))}
            {wards.length === 0 && <p className="muted">No ward records found.</p>}
          </div>
        </div>
        <div className="detail-card">
          <h2>Field Workers</h2>
          <form className="settings-form" onSubmit={createWorker}>
            <label>
              Name or crew
              <input
                value={workerForm.name}
                onChange={(event) => updateWorkerForm('name', event.target.value)}
                required
              />
            </label>
            <label>
              Email
              <input
                value={workerForm.email}
                onChange={(event) => updateWorkerForm('email', event.target.value)}
                type="email"
                required
              />
            </label>
            <label>
              Phone
              <input
                value={workerForm.phone}
                onChange={(event) => updateWorkerForm('phone', event.target.value)}
                type="tel"
              />
            </label>
            <label>
              Ward
              <input
                value={workerForm.wardName}
                onChange={(event) => updateWorkerForm('wardName', event.target.value)}
                list="worker-ward-options"
                required
              />
              <datalist id="worker-ward-options">
                {wardSuggestions.map((wardName) => (
                  <option key={wardName} value={wardName} />
                ))}
              </datalist>
            </label>
            <label>
              Password
              <input
                value={workerForm.password}
                onChange={(event) => updateWorkerForm('password', event.target.value)}
                type="password"
                minLength={8}
                required
              />
            </label>
            {workerError && <p className="form-error">{workerError}</p>}
            {workerMessage && <p className="form-success">{workerMessage}</p>}
            <button type="submit" disabled={savingWorker}>
              {savingWorker ? 'Adding...' : 'Add worker'}
            </button>
          </form>
          <div className="stack-list compact-list">
            {workers.map((worker) => (
              <div className="list-row" key={worker._id}>
                <div>
                  <strong>{worker.name}</strong>
                  <span>{worker.email}</span>
                </div>
                <span>{worker.wardName || worker.ward?.name || 'No ward'}</span>
              </div>
            ))}
            {workers.length === 0 && <p className="muted">No field workers found.</p>}
          </div>
        </div>
        <div className="detail-card">
          <h2>Staff Users</h2>
          <div className="stack-list">
            {users.map((user) => (
              <div className="list-row" key={user._id}>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <span>{user.role}</span>
              </div>
            ))}
            {users.length === 0 && (
              <p className="muted">
                {canManageStaff(user?.role) ? 'No staff records found.' : 'Supervisor access required.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
