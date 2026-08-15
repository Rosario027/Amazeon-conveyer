// Partner dashboard — each owner's profit entitlement, withdrawals,
// available/negative balance, and the company's cash position.
//
// Profit is only withdrawable once a project is CLOSED. Drawing early is
// allowed but shows as a negative balance until the project closes.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';
import { today, localISO } from '../utils/dates.js';
import { stageLabel } from '../utils/stages.js';
import { IconDownload, IconLock } from '../icons.jsx';

const money = (n) => `₹ ${formatINR(n)}`;
const d10 = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const MODES = ['Bank', 'Cash', 'UPI', 'Card', 'Other'];
const PAGE = 5;

const emptyDraw = () => ({ owner: 1, kind: 'drawing', drawType: 'profit', projectId: '', payDate: today(), amount: '', mode: 'Bank', refNo: '', notes: '' });

export default function ProfitShare() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tab, setTab] = useState('summary');
  const [form, setForm] = useState(emptyDraw());
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [projPage, setProjPage] = useState(1);
  const [drawPage, setDrawPage] = useState(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [o, ps] = await Promise.all([api.partnerOverview(), api.projects()]);
      setData(o);
      setProjects(ps);
      setError('');
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  if (error && !data) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page"><div className="muted">Loading…</div></div>;

  const set = (patch) => setForm((v) => ({ ...v, ...patch }));
  const pnlColor = (n) => ({ color: n < 0 ? 'var(--red)' : 'var(--green)' });
  const [a, b] = data.owners;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (editId) {
        await api.updateWithdrawal(editId, form);
        setNotice('Withdrawal updated.');
      } else {
        const res = await api.addWithdrawal(form);
        setNotice(res.warning || 'Withdrawal recorded.');
      }
      setForm(emptyDraw());
      setEditId(null);
      setShowForm(false);
      await load();
      setTimeout(() => setNotice(''), 6000);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const startEdit = (w) => {
    setEditId(w.id);
    setForm({
      owner: w.owner, kind: w.kind || 'drawing', drawType: w.drawType || 'profit',
      projectId: w.projectId || '', payDate: localISO(new Date(w.payDate)),
      amount: w.amount, mode: w.mode, refNo: w.refNo, notes: w.notes,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (w) => {
    if (!window.confirm(`Delete this ${money(w.amount)} withdrawal?`)) return;
    try { await api.deleteWithdrawal(w.id); await load(); } catch (e) { setError(e.message); }
  };

  const OwnerCard = ({ o }) => (
    <div className={`card owner-card ${o.balance < 0 ? 'owner-neg' : ''}`}>
      <div className="owner-head">
        <div className="owner-name">{o.name}</div>
        <span className={`badge ${o.balance < 0 ? 'badge-red' : 'badge-green'}`} style={{ marginLeft: 0 }}>
          {o.balance < 0 ? 'overdrawn' : 'in credit'}
        </span>
      </div>
      <div className="owner-big" style={pnlColor(o.balance)}>{money(o.balance)}</div>
      <div className="muted tiny">{o.balance < 0
        ? 'Balance is negative until open projects are closed'
        : 'Available to withdraw'}</div>
      <table className="totals-mini" style={{ marginTop: 10 }}><tbody>
        <tr><td>Share of closed projects</td><td className="r">{money(o.entitledClosed)}</td></tr>
        <tr><td>Locked in open projects <IconLock /></td><td className="r">{money(o.lockedOpen)}</td></tr>
        <tr><td>Capital introduced</td><td className="r">+ {money(o.introduced)}</td></tr>
        <tr><td>Withdrawn to date</td><td className="r">− {money(o.withdrawn)}</td></tr>
        <tr className="grand"><td>Balance</td><td className="r" style={pnlColor(o.balance)}>{money(o.balance)}</td></tr>
      </tbody></table>
    </div>
  );

  const shownProjects = data.projects.slice(0, projPage * PAGE);
  const shownDraws = data.withdrawals.slice(0, drawPage * PAGE);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Partner Dashboard <span className="muted h-sub">{data.owner1Name} · {data.owner2Name}</span></h1>
        <div className="page-actions">
          <button className="btn" onClick={() => api.downloadPartnerReport().catch((e) => setError(e.message))}><IconDownload /> Excel</button>
          <button className="btn btn-primary" onClick={() => { setEditId(null); setForm(emptyDraw()); setShowForm((v) => !v); }}>
            {showForm && !editId ? 'Close' : '+ Record Withdrawal'}
          </button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok" onClick={() => setNotice('')}>{notice}</div>}

      {showForm && (
        <div className="card">
          <h2>{editId ? 'Edit movement' : 'Record a movement'} <span className="muted h-sub">money taken out by, or put in by, an owner</span></h2>
          <div className="type-toggle" style={{ marginBottom: 14 }}>
            <button className={`type-btn ${form.kind !== 'introduction' ? 'sel' : ''}`} onClick={() => set({ kind: 'drawing' })}>
              <b>Taking out</b><span>Withdrawal — money leaves the business</span>
            </button>
            <button className={`type-btn ${form.kind === 'introduction' ? 'sel' : ''}`} onClick={() => set({ kind: 'introduction' })}>
              <b>Putting in</b><span>Capital introduced — money comes in</span>
            </button>
          </div>
          <div className="form-grid">
            {form.kind !== 'introduction' && (
              <label>Withdrawal type
                <select value={form.drawType} onChange={(e) => set({ drawType: e.target.value })}>
                  <option value="profit">Profit withdrawal</option>
                  <option value="cash">Cash withdrawal</option>
                </select>
              </label>
            )}
            <label>Owner
              <select value={form.owner} onChange={(e) => set({ owner: Number(e.target.value) })}>
                <option value={1}>{data.owner1Name}</option>
                <option value={2}>{data.owner2Name}</option>
              </select>
            </label>
            <label>Against project (optional)
              <select value={form.projectId} onChange={(e) => set({ projectId: e.target.value })}>
                <option value="">— general drawing —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}{p.summary.closed ? '' : ' (open)'}</option>)}
              </select>
            </label>
            <label>Date<input type="date" value={form.payDate} onChange={(e) => set({ payDate: e.target.value })} /></label>
            <label>Amount (₹)<input type="number" min="0" step="any" value={form.amount} onChange={(e) => set({ amount: e.target.value })} /></label>
            <label>Mode
              <select value={form.mode} onChange={(e) => set({ mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <label>Reference<input value={form.refNo} onChange={(e) => set({ refNo: e.target.value })} placeholder="txn / cheque no" /></label>
            <label className="span2">Notes<input value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="optional" /></label>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Ideally withdrawals happen after a project closes. Early withdrawals are allowed — the
            owner's balance will show negative until the project completes and the profit lands.
          </div>
          <div className="page-actions" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy || !(Number(form.amount) > 0)}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi kpi-blue">
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-value">{money(data.totals.revenue)}</div>
          <div className="kpi-sub">{data.totals.projects} project{data.totals.projects !== 1 ? 's' : ''}, {data.totals.closed} closed</div>
        </div>
        <div className={`kpi ${data.totals.pnl < 0 ? 'kpi-red' : 'kpi-green'}`}>
          <div className="kpi-label">Net Profit / Loss</div>
          <div className="kpi-value" style={pnlColor(data.totals.pnl)}>{money(data.totals.pnl)}</div>
          <div className="kpi-sub">total costs {money(data.totals.costs)}</div>
        </div>
        <div className="kpi kpi-purple">
          <div className="kpi-label">Reserve ({data.reservePercent}% of profit)</div>
          <div className="kpi-value">{money(data.totals.reserve)}</div>
          <div className="kpi-sub">{data.reservePercent}% of {money(data.totals.pnl)} — distributable: {money(data.totals.distributable)}</div>
        </div>
        <div className="kpi kpi-slate">
          <div className="kpi-label">Company Cash</div>
          <div className="kpi-value">{money(data.cash.net)}</div>
          <div className="kpi-sub">cash in hand {money(data.cash.inHand)} · bank {money(data.cash.inBank)}</div>
        </div>
      </div>

      <div className="tabs">
        {['summary', 'projects', 'withdrawals'].map((t) => (
          <button key={t} className={`tab ${tab === t ? 'sel' : ''}`} onClick={() => setTab(t)}>
            {t === 'summary' ? 'Partners' : t === 'projects' ? 'By project' : 'Withdrawals'}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <>
          <div className="owner-grid">
            <OwnerCard o={a} />
            <OwnerCard o={b} />
          </div>
          <div className="card">
            <h2>Cash position <span className="muted h-sub">what's left with the company</span></h2>
            <table className="totals-mini"><tbody>
              <tr><td>Received from customers</td><td className="r">{money(data.cash.inflow)}</td></tr>
              <tr><td>Capital introduced by owners</td><td className="r">+ {money(data.cash.introduced)}</td></tr>
              <tr><td>Paid out (suppliers, expenses, consultants)</td><td className="r">− {money(data.cash.outflow)}</td></tr>
              <tr><td>Owner drawings (profit {money(data.cash.profitDrawn)} · cash {money(data.cash.cashDrawn)})</td><td className="r">− {money(data.cash.withdrawn)}</td></tr>
              <tr className="grand"><td>Cash with the company</td><td className="r">{money(data.cash.net)}</td></tr>
              <tr><td>&nbsp;&nbsp;• in hand (cash)</td><td className="r">{money(data.cash.inHand)}</td></tr>
              <tr><td>&nbsp;&nbsp;• in bank / digital</td><td className="r">{money(data.cash.inBank)}</td></tr>
              <tr><td>Pending payout to owners</td><td className="r">{money(data.cash.pendingToOwners)}</td></tr>
              <tr><td>Held back as reserve &amp; surplus</td><td className="r">{money(data.cash.retainedReserve)}</td></tr>
            </tbody></table>
            <div className="hint" style={{ marginTop: 8 }}>
              The reserve % is set under <b>Settings → Reserve &amp; Surplus</b>. Each withdrawal is also recorded
              in Accounts as an owner drawing.
            </div>
          </div>
        </>
      )}

      {tab === 'projects' && (
        <div className="card table-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th><th>Stage</th><th className="r">P&amp;L</th><th className="r">Reserve</th>
                  <th className="c">Split</th>
                  <th className="r">{data.owner1Name}</th><th className="r">drawn</th>
                  <th className="r">{data.owner2Name}</th><th className="r">drawn</th>
                </tr>
              </thead>
              <tbody>
                {shownProjects.map((p) => (
                  <tr key={p.id} className={p.closed ? '' : 'row-open'} onClick={() => navigate(`/projects/${p.id}`)}>
                    <td><b>{p.name}</b><div className="muted tiny">{p.code}</div></td>
                    <td>
                      <span className={`badge ${p.closed ? 'badge-slate' : 'badge-blue'}`} style={{ marginLeft: 0 }}>{stageLabel(p.stage)}</span>
                      {!p.closed && <span className="lock-tag" title="profit locked until the project closes"><IconLock /></span>}
                    </td>
                    <td className="r" style={pnlColor(p.pnl)}><b>{money(p.pnl)}</b></td>
                    <td className="r">{money(p.reserve)}</td>
                    <td className="c"><span className="badge badge-amber" style={{ marginLeft: 0 }}>{p.owner1Share}／{p.owner2Share}</span></td>
                    <td className="r" style={pnlColor(p.pnlOwner1)}>{money(p.pnlOwner1)}</td>
                    <td className="r muted">{money(p.drawn1)}</td>
                    <td className="r" style={pnlColor(p.pnlOwner2)}>{money(p.pnlOwner2)}</td>
                    <td className="r muted">{money(p.drawn2)}</td>
                  </tr>
                ))}
                {data.projects.length === 0 && <tr><td colSpan={9} className="c muted empty-row">No projects yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {data.projects.length > shownProjects.length && (
            <div className="more-row">
              <button className="btn btn-ghost" onClick={() => setProjPage(projPage + 1)}>
                Show {Math.min(PAGE, data.projects.length - shownProjects.length)} more
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'withdrawals' && (
        <div className="card table-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Owner</th><th>Direction</th><th>Type</th><th>Project</th><th>Mode</th><th>Notes</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>
                {shownDraws.map((w) => {
                  const intro = w.kind === 'introduction';
                  return (
                    <tr key={w.id} style={{ cursor: 'default' }}>
                      <td className="nowrap">{d10(w.payDate)}</td>
                      <td><b>{w.owner === 1 ? data.owner1Name : data.owner2Name}</b></td>
                      <td><span className={`badge ${intro ? 'badge-green' : 'badge-red'}`} style={{ marginLeft: 0 }}>{intro ? 'introduced' : 'drawn'}</span></td>
                      <td>{intro ? 'Capital' : w.drawType === 'cash' ? 'Cash' : 'Profit'}</td>
                      <td>{w.project ? <span className="proj-tag">{w.project.code}</span> : <span className="muted">general</span>}</td>
                      <td>{w.mode}</td>
                      <td className="desc-cell">{w.notes || '—'}</td>
                      <td className="r" style={{ color: intro ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                        {intro ? '+' : '−'} {money(w.amount)}
                      </td>
                      <td className="r nowrap">
                        <button className="mini-btn" onClick={() => startEdit(w)}>Edit</button>
                        <button className="mini-btn danger" onClick={() => remove(w)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
                {data.withdrawals.length === 0 && <tr><td colSpan={9} className="c muted empty-row">No withdrawals recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {data.withdrawals.length > shownDraws.length && (
            <div className="more-row">
              <button className="btn btn-ghost" onClick={() => setDrawPage(drawPage + 1)}>
                Show {Math.min(PAGE, data.withdrawals.length - shownDraws.length)} more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
