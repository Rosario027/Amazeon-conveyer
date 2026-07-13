import React, { useState } from 'react';
import { api, storeAuth } from '../api.js';
import { LogoMark, Wordmark } from '../logo.jsx';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, user } = await api.login(username, password);
      storeAuth(token, user);
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-mark"><LogoMark size={64} /></span>
          <Wordmark />
        </div>
        <h1>Sign in</h1>
        <p className="login-sub">ERP — Invoicing · Purchases · GST Reports</p>
        <form onSubmit={submit}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" placeholder="admin1" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
          </label>
          {error && <div className="login-error">{error}</div>}
          <button className="btn btn-primary login-btn" disabled={busy || !username || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
      <div className="login-foot">© {new Date().getFullYear()} Amazeon Shopping — OE Belts &amp; Conveyors</div>
    </div>
  );
}
