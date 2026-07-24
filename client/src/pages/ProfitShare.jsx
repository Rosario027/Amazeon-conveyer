// Profit Share — the two owners' cut of every project's P&L in one view.
// Share % is set per project (Projects → Edit); profits AND losses split
// by the same percentage.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

const money = (n) => `₹ ${formatINR(n)}`;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export default function ProfitShare() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = async (filters = {}) => {
    try {
      const [projects, s] = await Promise.all([api.projects(filters), settings ? Promise.resolve(settings) : api.settings()]);
      setRows(projects);
      setSettings(s);
      setError('');
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const o1 = settings?.owner1Name || 'Owner 1';
  const o2 = settings?.owner2Name || 'Owner 2';

  const totals = useMemo(() => rows.reduce((acc, p) => ({
    revenue: r2(acc.revenue + p.summary.income),
    costs: r2(acc.costs + p.summary.costs),
    pnl: r2(acc.pnl + p.summary.pnl),
    owner1: r2(acc.owner1 + p.summary.pnlOwner1),
    owner2: r2(acc.owner2 + p.summary.pnlOwner2),
  }), { revenue: 0, costs: 0, pnl: 0, owner1: 0, owner2: 0 }), [rows]);

  const pnlColor = (n) => ({ color: n < 0 ? 'var(--red)' : 'var(--green)' });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Profit Share <span className="muted h-sub">{o1} · {o2}</span></h1>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="kpi-grid">
        <div className="kpi kpi-blue">
          <div className="kpi-label">Total project revenue</div>
          <div className="kpi-value">{money(totals.revenue)}</div>
          <div className="kpi-sub">{rows.length} project{rows.length === 1 ? '' : 's'} · costs {money(totals.costs)}</div>
        </div>
        <div className={`kpi ${totals.pnl < 0 ? 'kpi-red' : 'kpi-green'}`}>
          <div className="kpi-label">Total P&amp;L</div>
          <div className="kpi-value" style={pnlColor(totals.pnl)}>{money(totals.pnl)}</div>
          <div className="kpi-sub">across the filtered projects</div>
        </div>
        <div className="kpi kpi-orange">
          <div className="kpi-label">{o1}'s share</div>
          <div className="kpi-value" style={pnlColor(totals.owner1)}>{money(totals.owner1)}</div>
          <div className="kpi-sub">per-project % applied to each P&amp;L</div>
        </div>
        <div className="kpi kpi-purple">
          <div className="kpi-label">{o2}'s share</div>
          <div className="kpi-value" style={pnlColor(totals.owner2)}>{money(totals.owner2)}</div>
          <div className="kpi-sub">per-project % applied to each P&amp;L</div>
        </div>
      </div>

      <div className="card filter-bar">
        <input className="filter-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load({ q, status })} placeholder="Search projects" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); load({ q, status: e.target.value }); }}>
          <option value="">All projects</option>
          <option value="active">Active only</option>
          <option value="completed">Completed only</option>
        </select>
        <button className="btn" onClick={() => load({ q, status })}>Apply</button>
      </div>

      <div className="card table-card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th><th>Status</th>
                <th className="r">Revenue</th><th className="r">Costs</th><th className="r">P&amp;L</th>
                <th className="c">Split</th>
                <th className="r">{o1}</th><th className="r">{o2}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
                  <td><b>{p.name}</b><div className="muted tiny">{p.code}{p.customerName ? ` · ${p.customerName}` : ''}</div></td>
                  <td><span className={`badge ${p.status === 'active' ? 'badge-blue' : 'badge-slate'}`} style={{ marginLeft: 0 }}>{p.status}</span></td>
                  <td className="r">{money(p.summary.income)}</td>
                  <td className="r">{money(p.summary.costs)}</td>
                  <td className="r" style={pnlColor(p.summary.pnl)}><b>{money(p.summary.pnl)}</b></td>
                  <td className="c"><span className="badge badge-amber" style={{ marginLeft: 0 }}>{p.summary.owner1Share}／{p.summary.owner2Share}</span></td>
                  <td className="r" style={pnlColor(p.summary.pnlOwner1)}>{money(p.summary.pnlOwner1)}</td>
                  <td className="r" style={pnlColor(p.summary.pnlOwner2)}>{money(p.summary.pnlOwner2)}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="totals-row">
                  <td colSpan={2}><b>TOTAL</b></td>
                  <td className="r"><b>{money(totals.revenue)}</b></td>
                  <td className="r"><b>{money(totals.costs)}</b></td>
                  <td className="r" style={pnlColor(totals.pnl)}><b>{money(totals.pnl)}</b></td>
                  <td />
                  <td className="r" style={pnlColor(totals.owner1)}><b>{money(totals.owner1)}</b></td>
                  <td className="r" style={pnlColor(totals.owner2)}><b>{money(totals.owner2)}</b></td>
                </tr>
              )}
              {rows.length === 0 && <tr><td colSpan={8} className="c muted empty-row">No projects yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hint-card">
        Owner names are set in <b>Invoice Settings → Owners</b>. Each project's split is edited on the
        project page (<b>Edit</b>) — default is 50／50, and losses divide by the same percentage.
      </div>
    </div>
  );
}
