// Payments — every project payment across the company in one feed,
// each row tagged with its project. Record new payments from here too.
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';
import { today, monthStart, monthEnd } from '../utils/dates.js';

const money = (n) => `₹ ${formatINR(n)}`;
const d10 = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const TYPE_LABEL = {
  'customer-payment': 'Customer payment',
  'supplier-payment': 'Supplier payment',
  expense: 'Expense',
  consultant: 'Consultant',
};
const TYPE_BADGE = {
  'customer-payment': 'badge-green',
  'supplier-payment': 'badge-blue',
  expense: 'badge-orange',
  consultant: 'badge-purple',
};

const emptyForm = () => ({ projectId: '', type: 'customer-payment', chargeTo: 'company', payDate: today(), amount: '', mode: 'Bank', refNo: '', description: '', partyName: '', agentId: '' });

export default function Payments() {
  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [agents, setAgents] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState('');
  const [projectId, setProjectId] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (filters = {}) => {
    try { setRows(await api.paymentsFeed(filters)); setError(''); } catch (e) { setError(e.message); }
  };
  useEffect(() => {
    load();
    api.projects({ status: 'active' }).then(setProjects).catch(() => {});
    api.agents().then(setAgents).catch(() => {});
  }, []);

  const apply = (patch = {}) => {
    const f = { from, to, type, projectId, q, ...patch };
    load(f);
  };

  const set = (patch) => setForm((v) => ({ ...v, ...patch }));

  const save = async () => {
    if (!form.projectId) { setError('Choose the project this payment belongs to.'); return; }
    setBusy(true);
    setError('');
    try {
      await api.addProjectPayment(form.projectId, form);
      setForm(emptyForm());
      setShowForm(false);
      setNotice('Payment recorded — project balances updated.');
      setTimeout(() => setNotice(''), 4000);
      apply();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const totals = useMemo(() => rows.reduce((acc, p) => {
    if (p.type === 'customer-payment') acc.in += p.amount; else acc.out += p.amount;
    return acc;
  }, { in: 0, out: 0 }), [rows]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Payments <span className="muted h-sub">all projects</span></h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : '+ Record Payment'}</button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      {showForm && (
        <div className="card">
          <h2>Record a payment</h2>
          <div className="form-grid">
            <label>Project <span className="req">*</span>
              <select value={form.projectId} onChange={(e) => set({ projectId: e.target.value })}>
                <option value="">— select project —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </label>
            <label>Type
              <select value={form.type} onChange={(e) => set({ type: e.target.value })}>
                <option value="customer-payment">Customer payment (money in)</option>
                <option value="supplier-payment">Supplier payment (money out)</option>
                <option value="expense">Expense (money out)</option>
                <option value="consultant">Consultant / referral (money out)</option>
              </select>
            </label>
            {form.type === 'expense' && (
              <label>Borne by
                <select value={form.chargeTo} onChange={(e) => set({ chargeTo: e.target.value })}>
                  <option value="company">Company (project cost)</option>
                  <option value="customer">Customer (billable)</option>
                </select>
              </label>
            )}
            {form.type === 'consultant' && (
              <label>Agent (optional)
                <select value={form.agentId} onChange={(e) => set({ agentId: e.target.value })}>
                  <option value="">— not a registered agent —</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.pan})</option>)}
                </select>
              </label>
            )}
            {(form.type === 'consultant' || form.type === 'expense') && (
              <label>{form.type === 'consultant' ? 'Consultant name' : 'Paid to'}<input value={form.partyName} onChange={(e) => set({ partyName: e.target.value })} placeholder="optional" /></label>
            )}
            <label>Date<input type="date" value={form.payDate} onChange={(e) => set({ payDate: e.target.value })} /></label>
            <label>Amount (₹)<input type="number" min="0" step="any" value={form.amount} onChange={(e) => set({ amount: e.target.value })} /></label>
            <label>Mode
              <select value={form.mode} onChange={(e) => set({ mode: e.target.value })}>{['Bank', 'Cash', 'UPI', 'Card', 'Other'].map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <label>Reference<input value={form.refNo} onChange={(e) => set({ refNo: e.target.value })} placeholder="txn / cheque no" /></label>
            <label className="span2">Description<input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="optional" /></label>
          </div>
          <div className="page-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={save} disabled={busy || !(Number(form.amount) > 0) || !form.projectId}>{busy ? 'Saving…' : 'Save Payment'}</button>
          </div>
        </div>
      )}

      <div className="card filter-bar">
        <input className="filter-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="Search party / description / ref" />
        <select value={projectId} onChange={(e) => { setProjectId(e.target.value); apply({ projectId: e.target.value }); }}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <select value={type} onChange={(e) => { setType(e.target.value); apply({ type: e.target.value }); }}>
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn" onClick={() => apply()}>Apply</button>
        <button className="btn btn-ghost" onClick={() => { setFrom(monthStart()); setTo(monthEnd()); apply({ from: monthStart(), to: monthEnd() }); }}>This month</button>
      </div>

      <div className="mini-stats">
        <span>Entries: <b>{rows.length}</b></span>
        <span>Money in: <b style={{ color: 'var(--green)' }}>{money(totals.in)}</b></span>
        <span>Money out: <b style={{ color: 'var(--red)' }}>{money(totals.out)}</b></span>
      </div>

      <div className="card table-card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Project</th><th>Type</th><th>Party</th><th>Description</th><th>Mode</th><th>Ref</th><th className="r">Amount</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} style={{ cursor: 'default' }}>
                  <td className="nowrap">{d10(p.payDate)}</td>
                  <td><Link className="proj-tag" to={`/projects/${p.project?.id}`} onClick={(e) => e.stopPropagation()}>{p.project?.code} · {p.project?.name}</Link></td>
                  <td>
                    <span className={`badge ${TYPE_BADGE[p.type]}`} style={{ marginLeft: 0 }}>{TYPE_LABEL[p.type]}</span>
                    {p.type === 'expense' && p.chargeTo === 'customer' && <span className="badge badge-amber">billable</span>}
                  </td>
                  <td>{p.agent?.name || p.partyName || '—'}</td>
                  <td className="desc-cell" title={p.description}>{p.description || '—'}</td>
                  <td>{p.mode}</td>
                  <td className="muted">{p.refNo || '—'}</td>
                  <td className="r" style={{ color: p.type === 'customer-payment' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                    {p.type === 'customer-payment' ? '+' : '−'} {money(p.amount)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="c muted empty-row">No payments recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
