// Admin Config — manage login accounts + change your own password.
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function AdminConfig({ user }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // new user form
  const [nu, setNu] = useState({ username: '', password: '', role: 'admin' });
  // change password form
  const [cp, setCp] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState('');

  const load = () => api.users().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const flash = (msg) => { setNotice(msg); setError(''); setTimeout(() => setNotice(''), 4000); };

  const addUser = async () => {
    setBusy('add');
    try {
      await api.createUser(nu);
      setNu({ username: '', password: '', role: 'admin' });
      flash('Account created.');
      load();
    } catch (e) { setError(e.message); }
    setBusy('');
  };

  const resetPwd = async (u) => {
    const pwd = window.prompt(`New password for "${u.username}" (min 4 chars):`);
    if (!pwd) return;
    try { await api.resetPassword(u.id, pwd); flash(`Password reset for ${u.username}.`); } catch (e) { setError(e.message); }
  };

  const removeUser = async (u) => {
    if (!window.confirm(`Delete account "${u.username}"? They will no longer be able to sign in.`)) return;
    try { await api.deleteUser(u.id); flash('Account deleted.'); load(); } catch (e) { setError(e.message); }
  };

  const changeMyPassword = async () => {
    if (cp.next !== cp.confirm) { setError('New passwords do not match.'); return; }
    setBusy('cp');
    try {
      await api.changePassword(cp.current, cp.next);
      setCp({ current: '', next: '', confirm: '' });
      flash('Your password has been changed.');
    } catch (e) { setError(e.message); }
    setBusy('');
  };

  return (
    <div className="page">
      <div className="page-head"><h1>Admin Config</h1></div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="card">
        <h2>Login Accounts</h2>
        <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Username</th><th>Role</th><th>Created</th><th className="r">Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.username}</b>{u.username === user.username && <span className="badge badge-blue">you</span>}</td>
                <td>{u.role}</td>
                <td className="muted">{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
                <td className="r nowrap">
                  <button className="mini-btn" onClick={() => resetPwd(u)}>Reset password</button>
                  {u.username !== user.username && <button className="mini-btn danger" onClick={() => removeUser(u)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <h3 className="sub-head">Add account</h3>
        <div className="form-row">
          <input value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} placeholder="username" />
          <input type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="password (min 4)" />
          <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
            <option value="admin">admin — full access</option>
            <option value="user">user — no admin config</option>
          </select>
          <button className="btn btn-primary" onClick={addUser} disabled={busy === 'add' || !nu.username || !nu.password}>Add</button>
        </div>
      </div>

      <div className="card">
        <h2>Change My Password</h2>
        <div className="form-row">
          <input type="password" value={cp.current} onChange={(e) => setCp({ ...cp, current: e.target.value })} placeholder="current password" />
          <input type="password" value={cp.next} onChange={(e) => setCp({ ...cp, next: e.target.value })} placeholder="new password" />
          <input type="password" value={cp.confirm} onChange={(e) => setCp({ ...cp, confirm: e.target.value })} placeholder="confirm new password" />
          <button className="btn btn-primary" onClick={changeMyPassword} disabled={busy === 'cp' || !cp.current || !cp.next}>Change</button>
        </div>
      </div>
    </div>
  );
}
