// Accounts — inflow/outflow tracker. Manual money-in / money-out entries
// (expenses, other income) merged with invoices (in) and purchases (out);
// period filter + Excel download.
import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';
import { today, monthStart, monthEnd, localISO } from '../utils/dates.js';

const d10 = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const CATEGORIES = ['Rent', 'Salary', 'Electricity', 'Transport', 'Raw Material', 'Office Expense', 'Maintenance', 'Bank Charges', 'Other Income', 'Capital', 'General'];
const MODES = ['Cash', 'Bank', 'UPI', 'Card', 'Other'];

const lastMonthRange = () => {
  const n = new Date();
  return {
    from: localISO(new Date(n.getFullYear(), n.getMonth() - 1, 1)),
    to: localISO(new Date(n.getFullYear(), n.getMonth(), 0)),
  };
};

const emptyEntry = () => ({ entryDate: today(), kind: 'out', category: 'General', description: '', mode: 'Cash', refNo: '', amount: '' });

export default function Accounts() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [ledger, setLedger] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('');
  const [form, setForm] = useState(emptyEntry());
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = async (f = from, t = to) => {
    try { setLedger(await api.ledger(f, t)); setError(''); } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const preset = (p) => { setFrom(p.from); setTo(p.to); load(p.from, p.to); };
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setBusy('save');
    setError('');
    try {
      if (editingId) await api.updateEntry(editingId, form);
      else await api.createEntry(form);
      setForm(emptyEntry());
      setEditingId(null);
      setShowForm(false);
      await load();
    } catch (e) { setError(e.message); }
    setBusy('');
  };

  const startEdit = (row) => {
    setEditingId(row.sourceId);
    setForm({
      entryDate: localISO(new Date(row.date)), kind: row.kind, category: row.category,
      description: row.description, mode: row.mode || 'Cash', refNo: row.refNo, amount: row.amount,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete this ${row.kind === 'in' ? 'money-in' : 'money-out'} entry of ₹ ${formatINR(row.amount)}?`)) return;
    try { await api.deleteEntry(row.sourceId); await load(); } catch (e) { setError(e.message); }
  };

  const downloadExcel = async () => {
    setBusy('xlsx');
    try { await api.downloadLedger(from, to); } catch (e) { setError(e.message); }
    setBusy('');
  };

  const rows = useMemo(() => {
    if (!ledger) return [];
    return sourceFilter ? ledger.rows.filter((r) => r.source === sourceFilter) : ledger.rows;
  }, [ledger, sourceFilter]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Accounts <span className="muted h-sub">inflow / outflow</span></h1>
        <div className="page-actions">
          <button className="btn" onClick={downloadExcel} disabled={busy === 'xlsx'}>{busy === 'xlsx' ? 'Building…' : '⬇ Download Excel'}</button>
          <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(emptyEntry()); setShowForm((v) => !v); }}>
            {showForm && !editingId ? 'Close' : '+ Add Entry'}
          </button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      {showForm && (
        <div className="card">
          <h2>{editingId ? 'Edit Entry' : 'New Entry'} <span className="muted h-sub">expense or other income</span></h2>
          <div className="type-toggle" style={{ marginBottom: 14 }}>
            <button className={`type-btn ${form.kind === 'out' ? 'sel' : ''}`} onClick={() => set({ kind: 'out' })}>
              <b>Money Out</b><span>Expense / payment made</span>
            </button>
            <button className={`type-btn ${form.kind === 'in' ? 'sel' : ''}`} onClick={() => set({ kind: 'in' })}>
              <b>Money In</b><span>Receipt / other income</span>
            </button>
          </div>
          <div className="form-grid">
            <label>Date<input type="date" value={form.entryDate} onChange={(e) => set({ entryDate: e.target.value })} /></label>
            <label>Amount (₹)<input type="number" min="0" step="any" value={form.amount} onChange={(e) => set({ amount: e.target.value })} /></label>
            <label>Category
              <input list="acc-categories" value={form.category} onChange={(e) => set({ category: e.target.value })} />
              <datalist id="acc-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label>Mode
              <select value={form.mode} onChange={(e) => set({ mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <label className="span2">Description<input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Shop rent for July" /></label>
            <label>Reference<input value={form.refNo} onChange={(e) => set({ refNo: e.target.value })} placeholder="txn id / cheque no (optional)" /></label>
          </div>
          <div className="page-actions" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy === 'save' || !(Number(form.amount) > 0)}>
              {busy === 'save' ? 'Saving…' : editingId ? 'Save Changes' : 'Save Entry'}
            </button>
          </div>
        </div>
      )}

      <div className="card filter-bar">
        <label className="inline-label">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline-label">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn" onClick={() => load()}>Apply</button>
        <span className="filter-sep" />
        <button className="btn btn-ghost" onClick={() => preset({ from: monthStart(), to: monthEnd() })}>This month</button>
        <button className="btn btn-ghost" onClick={() => preset(lastMonthRange())}>Last month</button>
        <span className="filter-sep" />
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="">All sources</option>
          <option value="manual">Manual entries</option>
          <option value="invoice">Invoices (money in)</option>
          <option value="purchase">Purchases (money out)</option>
        </select>
      </div>

      {ledger && (
        <div className="kpi-grid">
          <div className="kpi kpi-green">
            <div className="kpi-label">Money In</div>
            <div className="kpi-value">₹ {formatINR(ledger.totals.inflow)}</div>
            <div className="kpi-sub">{ledger.totals.inCount} entr{ledger.totals.inCount === 1 ? 'y' : 'ies'} (invoices + receipts)</div>
          </div>
          <div className="kpi kpi-red">
            <div className="kpi-label">Money Out</div>
            <div className="kpi-value">₹ {formatINR(ledger.totals.outflow)}</div>
            <div className="kpi-sub">{ledger.totals.outCount} entr{ledger.totals.outCount === 1 ? 'y' : 'ies'} (purchases + expenses)</div>
          </div>
          <div className="kpi kpi-blue">
            <div className="kpi-label">Net Cash Flow</div>
            <div className="kpi-value" style={{ color: ledger.totals.net < 0 ? 'var(--red)' : 'var(--green)' }}>₹ {formatINR(ledger.totals.net)}</div>
            <div className="kpi-sub">{from} → {to}</div>
          </div>
        </div>
      )}

      <div className="card table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Source</th><th>Category</th><th>Description</th><th>Mode</th><th>Ref</th>
              <th className="r">Money In</th><th className="r">Money Out</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((x, i) => (
              <tr key={`${x.source}-${x.sourceId}-${i}`} style={{ cursor: 'default' }}>
                <td>{d10(x.date)}</td>
                <td><span className={`badge ${x.source === 'invoice' ? 'badge-blue' : x.source === 'purchase' ? 'badge-orange' : 'badge-slate'}`} style={{ marginLeft: 0 }}>{x.source}</span></td>
                <td>{x.category}</td>
                <td className="desc-cell" title={x.description}>{x.description || '—'}</td>
                <td>{x.mode || '—'}</td>
                <td className="muted">{x.refNo || '—'}</td>
                <td className="r" style={{ color: 'var(--green)', fontWeight: x.kind === 'in' ? 700 : 400 }}>{x.kind === 'in' ? `₹ ${formatINR(x.amount)}` : ''}</td>
                <td className="r" style={{ color: 'var(--red)', fontWeight: x.kind === 'out' ? 700 : 400 }}>{x.kind === 'out' ? `₹ ${formatINR(x.amount)}` : ''}</td>
                <td className="r nowrap">
                  {x.source === 'manual' && (
                    <>
                      <button className="mini-btn" onClick={() => startEdit(x)}>Edit</button>
                      <button className="mini-btn danger" onClick={() => remove(x)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="c muted empty-row">Nothing in this period yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="hint-card">
        Invoices appear automatically as <b>money in</b> and purchases as <b>money out</b>. Use manual entries for
        everything else — rent, salaries, transport, other income. The Excel export includes a summary,
        category-wise breakdown, and the full ledger for the selected period.
      </div>
    </div>
  );
}
