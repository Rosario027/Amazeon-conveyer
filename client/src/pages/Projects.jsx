// Projects — list with live money summaries + create form.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

const money = (n) => `₹ ${formatINR(n)}`;

const emptyForm = () => ({ name: '', customerName: '', supplierName: '', supplierPayable: '', owner1Share: 50, notes: '' });

export default function Projects() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async (filters = {}) => {
    setLoading(true);
    try { setRows(await api.projects(filters)); setError(''); } catch (e) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const p = await api.createProject(form);
      setForm(emptyForm());
      setShowForm(false);
      navigate(`/projects/${p.id}`);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Projects</h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : '+ New Project'}</button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      {showForm && (
        <div className="card">
          <h2>New Project</h2>
          <div className="form-grid">
            <label>Project name <span className="req">*</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Salem plant conveyor install" autoFocus />
            </label>
            <label>Customer
              <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="who this project is for" />
            </label>
            <label>Supplier
              <input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} placeholder="main supplier (optional)" />
            </label>
            <label>Total payable to supplier (₹)
              <input type="number" min="0" step="any" value={form.supplierPayable} onChange={(e) => setForm({ ...form, supplierPayable: e.target.value })} />
            </label>
            <label>Owner 1 share of P&amp;L (%)
              <input type="number" min="0" max="100" step="any" value={form.owner1Share} onChange={(e) => setForm({ ...form, owner1Share: e.target.value })} />
            </label>
            <div className="hint">Owner 2 gets the remaining {Math.round((100 - (Number(form.owner1Share) || 0)) * 100) / 100}% — editable later from the project page.</div>
            <label className="span2">Notes
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
            </label>
          </div>
          <div className="page-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={create} disabled={busy || !form.name.trim()}>{busy ? 'Creating…' : 'Create Project'}</button>
          </div>
        </div>
      )}

      <div className="card filter-bar">
        <input className="filter-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load({ q, status })} placeholder="Search project / customer / supplier" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); load({ q, status: e.target.value }); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
        <button className="btn" onClick={() => load({ q, status })}>Search</button>
      </div>

      <div className="proj-grid">
        {rows.map((p) => (
          <button key={p.id} className="proj-card" onClick={() => navigate(`/projects/${p.id}`)}>
            <div className="proj-card-head">
              <div>
                <div className="proj-name">{p.name}</div>
                <div className="proj-sub">{p.code}{p.customerName ? ` · ${p.customerName}` : ''} · split {p.summary.owner1Share}／{p.summary.owner2Share}</div>
              </div>
              <span className={`badge ${p.status === 'active' ? 'badge-blue' : 'badge-slate'}`} style={{ marginLeft: 0 }}>{p.status}</span>
            </div>
            <div className="proj-stats">
              <div><em>Invoiced</em><b>{money(p.summary.invoiced)}</b></div>
              <div><em>Receivable</em><b style={{ color: p.summary.receivable > 0 ? 'var(--orange-dark)' : 'var(--green)' }}>{money(p.summary.receivable)}</b></div>
              <div><em>Supplier bal.</em><b>{money(p.summary.supplierBalance)}</b></div>
              <div><em>P&amp;L</em><b style={{ color: p.summary.pnl < 0 ? 'var(--red)' : 'var(--green)' }}>{money(p.summary.pnl)}</b></div>
            </div>
          </button>
        ))}
        {!loading && rows.length === 0 && (
          <div className="muted empty-row" style={{ gridColumn: '1/-1', textAlign: 'center' }}>No projects yet — create your first one; invoices and payments all hang off projects.</div>
        )}
      </div>
    </div>
  );
}
