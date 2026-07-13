// Accounts — three tabs:
//  Ledger      inflow/outflow (invoices in, purchases out, commissions out,
//              manual entries incl. ADVANCE payments), period filter + Excel
//  Commissions per-invoice referral commissions + agent-wise totals
//  Agents      register commission agents (name/phone/PAN mandatory)
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

const emptyEntry = () => ({ entryDate: today(), kind: 'out', entryType: 'regular', partyName: '', category: 'General', description: '', mode: 'Cash', refNo: '', amount: '' });
const emptyAgent = () => ({ name: '', phone: '', pan: '', email: '', bankAccount: '', remarks: '' });

export default function Accounts() {
  const [tab, setTab] = useState('ledger');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [ledger, setLedger] = useState(null);
  const [comms, setComms] = useState(null);
  const [agents, setAgents] = useState([]);
  const [sourceFilter, setSourceFilter] = useState('');
  const [form, setForm] = useState(emptyEntry());
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [agentForm, setAgentForm] = useState(emptyAgent());
  const [agentEditId, setAgentEditId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const load = async (f = from, t = to) => {
    try {
      const [l, c, a] = await Promise.all([api.ledger(f, t), api.commissions(f, t), api.agents()]);
      setLedger(l); setComms(c); setAgents(a); setError('');
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 4000); };
  const preset = (p) => { setFrom(p.from); setTo(p.to); load(p.from, p.to); };
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // ── manual entries ──
  const save = async () => {
    setBusy('save');
    setError('');
    try {
      if (editingId) await api.updateEntry(editingId, form);
      else await api.createEntry(form);
      setForm(emptyEntry());
      setEditingId(null);
      setShowForm(false);
      flash('Entry saved.');
      await load();
    } catch (e) { setError(e.message); }
    setBusy('');
  };

  const startEdit = (row) => {
    setEditingId(row.sourceId);
    setForm({
      entryDate: localISO(new Date(row.date)), kind: row.kind, entryType: row.entryType || 'regular',
      partyName: row.partyName || '', category: row.category,
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

  // ── agents ──
  const saveAgent = async () => {
    setBusy('agent');
    setError('');
    try {
      if (agentEditId) await api.updateAgent(agentEditId, agentForm);
      else await api.createAgent(agentForm);
      setAgentForm(emptyAgent());
      setAgentEditId(null);
      flash(agentEditId ? 'Agent updated.' : 'Agent registered.');
      await load();
    } catch (e) { setError(e.message); }
    setBusy('');
  };

  const removeAgent = async (a) => {
    if (!window.confirm(`Delete agent "${a.name}"?`)) return;
    try { await api.deleteAgent(a.id); flash('Agent deleted.'); await load(); } catch (e) { setError(e.message); }
  };

  const rows = useMemo(() => {
    if (!ledger) return [];
    return sourceFilter ? ledger.rows.filter((r) => r.source === sourceFilter) : ledger.rows;
  }, [ledger, sourceFilter]);

  const srcBadge = (s) => s === 'invoice' ? 'badge-blue' : s === 'purchase' ? 'badge-orange' : s === 'commission' ? 'badge-purple' : 'badge-slate';

  return (
    <div className="page">
      <div className="page-head">
        <h1>Accounts</h1>
        <div className="page-actions">
          {tab === 'ledger' && (
            <>
              <button className="btn" onClick={downloadExcel} disabled={busy === 'xlsx'}>{busy === 'xlsx' ? 'Building…' : '⬇ Download Excel'}</button>
              <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(emptyEntry()); setShowForm((v) => !v); }}>
                {showForm && !editingId ? 'Close' : '+ Add Entry'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'ledger' ? 'sel' : ''}`} onClick={() => setTab('ledger')}>Ledger</button>
        <button className={`tab ${tab === 'commissions' ? 'sel' : ''}`} onClick={() => setTab('commissions')}>Commissions</button>
        <button className={`tab ${tab === 'agents' ? 'sel' : ''}`} onClick={() => setTab('agents')}>Agents</button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      {/* ══ LEDGER ══ */}
      {tab === 'ledger' && (
        <>
          {showForm && (
            <div className="card">
              <h2>{editingId ? 'Edit Entry' : 'New Entry'} <span className="muted h-sub">expense, income or advance payment</span></h2>
              <div className="type-toggle" style={{ marginBottom: 14 }}>
                <button className={`type-btn ${form.kind === 'out' ? 'sel' : ''}`} onClick={() => set({ kind: 'out' })}>
                  <b>Money Out</b><span>Expense / payment made</span>
                </button>
                <button className={`type-btn ${form.kind === 'in' ? 'sel' : ''}`} onClick={() => set({ kind: 'in' })}>
                  <b>Money In</b><span>Receipt / other income</span>
                </button>
              </div>
              <div className="form-grid">
                <label>Entry type
                  <select value={form.entryType} onChange={(e) => set({ entryType: e.target.value, category: e.target.value === 'advance' ? 'Advance' : form.category === 'Advance' ? 'General' : form.category })}>
                    <option value="regular">Regular</option>
                    <option value="advance">Advance payment</option>
                  </select>
                </label>
                {form.entryType === 'advance' && (
                  <label>Party name <span className="req">*</span>
                    <input value={form.partyName} onChange={(e) => set({ partyName: e.target.value })} placeholder={form.kind === 'in' ? 'Advance received from…' : 'Advance paid to…'} />
                  </label>
                )}
                <label>Date<input type="date" value={form.entryDate} onChange={(e) => set({ entryDate: e.target.value })} /></label>
                <label>Amount (₹)<input type="number" min="0" step="any" value={form.amount} onChange={(e) => set({ amount: e.target.value })} /></label>
                <label>Category
                  <input list="acc-categories" value={form.category} onChange={(e) => set({ category: e.target.value })} />
                  <datalist id="acc-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
                </label>
                <label>Mode
                  <select value={form.mode} onChange={(e) => set({ mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
                </label>
                <label className="span2">Description<input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder={form.entryType === 'advance' ? 'e.g. Advance against order / PO-123' : 'e.g. Shop rent for July'} /></label>
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
              <option value="commission">Commissions</option>
            </select>
          </div>

          {ledger && (
            <div className="kpi-grid">
              <div className="kpi kpi-green">
                <div className="kpi-label">Money In</div>
                <div className="kpi-value">₹ {formatINR(ledger.totals.inflow)}</div>
                <div className="kpi-sub">{ledger.totals.inCount} entries{ledger.totals.advanceIn > 0 ? ` · incl. advances ₹ ${formatINR(ledger.totals.advanceIn)}` : ''}</div>
              </div>
              <div className="kpi kpi-red">
                <div className="kpi-label">Money Out</div>
                <div className="kpi-value">₹ {formatINR(ledger.totals.outflow)}</div>
                <div className="kpi-sub">{ledger.totals.outCount} entries{ledger.totals.commissions > 0 ? ` · incl. commissions ₹ ${formatINR(ledger.totals.commissions)}` : ''}</div>
              </div>
              <div className="kpi kpi-blue">
                <div className="kpi-label">Net Cash Flow</div>
                <div className="kpi-value" style={{ color: ledger.totals.net < 0 ? 'var(--red)' : 'var(--green)' }}>₹ {formatINR(ledger.totals.net)}</div>
                <div className="kpi-sub">{from} → {to}</div>
              </div>
            </div>
          )}

          <div className="card table-card">
            <div className="table-scroll">
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
                      <td className="nowrap">{d10(x.date)}</td>
                      <td className="nowrap">
                        <span className={`badge ${srcBadge(x.source)}`} style={{ marginLeft: 0 }}>{x.source}</span>
                        {x.entryType === 'advance' && <span className="badge badge-amber">advance</span>}
                      </td>
                      <td>{x.category}</td>
                      <td className="desc-cell" title={x.description}>
                        {x.description || '—'}
                        {x.entryType === 'advance' && x.partyName && <div className="muted tiny">Party: {x.partyName}</div>}
                      </td>
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
          </div>

          <div className="hint-card">
            Invoices appear automatically as <b>money in</b>, purchases and referral commissions as <b>money out</b>.
            Use manual entries for everything else — rent, salaries, <b>advance payments</b> (tagged with the party),
            other income. The Excel export includes the summary, category breakdown, full ledger and a commissions sheet.
          </div>
        </>
      )}

      {/* ══ COMMISSIONS ══ */}
      {tab === 'commissions' && (
        <>
          <div className="card filter-bar">
            <label className="inline-label">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="inline-label">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <button className="btn" onClick={() => load()}>Apply</button>
            <button className="btn btn-ghost" onClick={() => preset({ from: monthStart(), to: monthEnd() })}>This month</button>
            <button className="btn btn-ghost" onClick={() => preset(lastMonthRange())}>Last month</button>
          </div>

          {comms && (
            <>
              <div className="kpi-grid">
                <div className="kpi kpi-purple">
                  <div className="kpi-label">Commissions (period)</div>
                  <div className="kpi-value">₹ {formatINR(comms.total)}</div>
                  <div className="kpi-sub">{comms.rows.length} invoice{comms.rows.length === 1 ? '' : 's'} with referral commission</div>
                </div>
                {comms.byAgent.slice(0, 3).map((a) => (
                  <div key={a.agentId ?? 'none'} className="kpi kpi-slate">
                    <div className="kpi-label">{a.name}</div>
                    <div className="kpi-value">₹ {formatINR(a.total)}</div>
                    <div className="kpi-sub">{a.count} invoice{a.count === 1 ? '' : 's'} · PAN {a.pan || '—'}</div>
                  </div>
                ))}
              </div>

              <div className="card table-card">
                <div className="card-head-row"><h2>Commission entries <span className="muted h-sub">internal reference — not printed on invoices</span></h2></div>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr><th>Date</th><th>Invoice</th><th>Customer</th><th className="r">Taxable</th><th>Agent</th><th>Basis</th><th className="r">Commission</th></tr>
                    </thead>
                    <tbody>
                      {comms.rows.map((x) => (
                        <tr key={x.invoiceId} style={{ cursor: 'default' }}>
                          <td className="nowrap">{d10(x.date)}</td>
                          <td><b>{x.invoiceNo}</b></td>
                          <td>{x.buyerName}</td>
                          <td className="r">₹ {formatINR(x.taxable)}</td>
                          <td>{x.agentName}<div className="muted tiny">{x.agentPan}</div></td>
                          <td>{x.basis}</td>
                          <td className="r"><b>₹ {formatINR(x.amount)}</b></td>
                        </tr>
                      ))}
                      {comms.rows.length === 0 && <tr><td colSpan={7} className="c muted empty-row">No commissions in this period — enable "Referral Commission" at the bottom of an invoice.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ══ AGENTS ══ */}
      {tab === 'agents' && (
        <>
          <div className="card">
            <h2>{agentEditId ? 'Edit Agent' : 'Register Agent'} <span className="muted h-sub">name, phone &amp; PAN are mandatory</span></h2>
            <div className="form-grid">
              <label>Name <span className="req">*</span><input value={agentForm.name} onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })} /></label>
              <label>Phone number <span className="req">*</span><input value={agentForm.phone} onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })} /></label>
              <label>PAN number <span className="req">*</span><input value={agentForm.pan} onChange={(e) => setAgentForm({ ...agentForm, pan: e.target.value.toUpperCase() })} maxLength={10} placeholder="ABCDE1234F" /></label>
              <label>Email<input value={agentForm.email} onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })} placeholder="optional" /></label>
              <label>Bank account number<input value={agentForm.bankAccount} onChange={(e) => setAgentForm({ ...agentForm, bankAccount: e.target.value })} placeholder="optional" /></label>
              <label>Remarks<input value={agentForm.remarks} onChange={(e) => setAgentForm({ ...agentForm, remarks: e.target.value })} placeholder="optional" /></label>
            </div>
            <div className="page-actions" style={{ marginTop: 12 }}>
              {agentEditId && <button className="btn" onClick={() => { setAgentEditId(null); setAgentForm(emptyAgent()); }}>Cancel</button>}
              <button className="btn btn-primary" onClick={saveAgent}
                disabled={busy === 'agent' || !agentForm.name.trim() || !agentForm.phone.trim() || !agentForm.pan.trim()}>
                {busy === 'agent' ? 'Saving…' : agentEditId ? 'Save Changes' : 'Register Agent'}
              </button>
            </div>
          </div>

          <div className="card table-card">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Name</th><th>Phone</th><th>PAN</th><th>Email</th><th>Bank A/C</th><th>Remarks</th><th className="r">Invoices</th><th /></tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id} style={{ cursor: 'default' }}>
                      <td><b>{a.name}</b></td>
                      <td>{a.phone}</td>
                      <td>{a.pan}</td>
                      <td>{a.email || '—'}</td>
                      <td>{a.bankAccount || '—'}</td>
                      <td className="desc-cell">{a.remarks || '—'}</td>
                      <td className="r">{a._count?.invoices ?? 0}</td>
                      <td className="r nowrap">
                        <button className="mini-btn" onClick={() => { setAgentEditId(a.id); setAgentForm({ name: a.name, phone: a.phone, pan: a.pan, email: a.email, bankAccount: a.bankAccount, remarks: a.remarks }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                        <button className="mini-btn danger" onClick={() => removeAgent(a)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {agents.length === 0 && <tr><td colSpan={8} className="c muted empty-row">No agents registered yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
