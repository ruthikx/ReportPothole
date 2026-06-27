import { useEffect, useState } from 'react';
import api from '../api.js';

export default function Settings() {
  const [wards, setWards] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      api.get('/tickets/meta/wards').then((res) => res.data.wards || []).catch(() => []),
      api.get('/tickets/meta/users').then((res) => res.data.users || []).catch(() => []),
    ]).then(([nextWards, nextUsers]) => {
      if (!mounted) return;
      setWards(nextWards);
      setUsers(nextUsers);
    });

    return () => {
      mounted = false;
    };
  }, []);

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
            {users.length === 0 && <p className="muted">No staff records found.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
