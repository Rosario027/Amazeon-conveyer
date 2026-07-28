// Reports — pick a period (defaults to the current month), see the GST
// position on screen, download the full Excel workbook.
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatINR, formatRate } from '../utils/money.js';
import { IconDownload } from '../icons.jsx';

import { localISO as iso } from '../utils/dates.js';
const thisMonth = () => {
  const n = new Date();
  return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: iso(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
};
const lastMonth = () => {
  const n = new Date();
  return { from: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: iso(new Date(n.getFullYear(), n.getMonth(), 0)) };
};
const thisQuarter = () => {
  const n = new Date();
  const qStart = Math.floor(n.getMonth() / 3) * 3;
  return { from: iso(new Date(n.getFullYear(), qStart, 1)), to: iso(new Date(n.getFullYear(), qStart + 3, 0)) };
};
const thisFY = () => {
  const n = new Date();
  const fyStartYear = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1;
  return { from: `${fyStartYear}-04-01`, to: `${fyStartYear + 1}-03-31` };
};

export default function Reports() {
  const [{ from, to }, setPeriod] = useState(thisMonth());
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = async (f = from, t = to) => {
    setBusy('load');
    setError('');
    try { setSummary(await api.gstSummary(f, t)); } catch (e) { setError(e.message); }
    setBusy('');
  };

  useEffect(() => { load(); }, []);

  const preset = (p) => { setPeriod(p); load(p.from, p.to); };

  const downloadExcel = async () => {
    setBusy('xlsx');
    setError('');
    try { await api.downloadGstReport(from, to); } catch (e) { setError(e.message); }
    setBusy('');
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Reports</h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={downloadExcel} disabled={busy === 'xlsx'}>
            {busy === 'xlsx' ? 'Building…' : <><IconDownload /> Download GST Report (Excel)</>}
          </button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="card filter-bar">
        <label className="inline-label">From <input type="date" value={from} onChange={(e) => setPeriod({ from: e.target.value, to })} /></label>
        <label className="inline-label">To <input type="date" value={to} onChange={(e) => setPeriod({ from, to: e.target.value })} /></label>
        <button className="btn" onClick={() => load()}>Apply</button>
        <span className="filter-sep" />
        <button className="btn btn-ghost" onClick={() => preset(thisMonth())}>This month</button>
        <button className="btn btn-ghost" onClick={() => preset(lastMonth())}>Last month</button>
        <button className="btn btn-ghost" onClick={() => preset(thisQuarter())}>This quarter</button>
        <button className="btn btn-ghost" onClick={() => preset(thisFY())}>This FY</button>
      </div>

      {!summary ? (
        <div className="muted">Loading…</div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi kpi-blue">
              <div className="kpi-label">Outward supplies (period)</div>
              <div className="kpi-value">₹ {formatINR(summary.sales.total)}</div>
              <div className="kpi-sub">{summary.sales.count} invoices · taxable ₹ {formatINR(summary.sales.taxable)}</div>
            </div>
            <div className="kpi kpi-orange">
              <div className="kpi-label">Tax collected</div>
              <div className="kpi-value">₹ {formatINR(summary.sales.tax)}</div>
              <div className="kpi-sub">CGST {formatINR(summary.sales.cgst)} · SGST {formatINR(summary.sales.sgst)} · IGST {formatINR(summary.sales.igst)}</div>
            </div>
            <div className="kpi kpi-green">
              <div className="kpi-label">B2B / B2C supplies</div>
              <div className="kpi-value">₹ {formatINR(summary.b2b.total)} / ₹ {formatINR(summary.b2c.total)}</div>
              <div className="kpi-sub">{summary.b2b.count} B2B · {summary.b2c.count} B2C{summary.cancelled.count ? ` · ${summary.cancelled.count} cancelled` : ''}</div>
            </div>
            <div className="kpi kpi-slate">
              <div className="kpi-label">Purchases (input side)</div>
              <div className="kpi-value">₹ {formatINR(summary.purchases.total)}</div>
              <div className="kpi-sub">{summary.purchases.count} bills · tax paid ₹ {formatINR(summary.purchases.tax)}</div>
            </div>
          </div>

          <div className="card table-card">
            <div className="card-head-row">
              <h2>Rate-wise tax breakup <span className="muted h-sub">{summary.from} → {summary.to}</span></h2>
            </div>
            <table className="data-table">
              <thead>
                <tr><th>GST Rate</th><th className="r">Taxable Value</th><th className="r">CGST</th><th className="r">SGST</th><th className="r">IGST</th><th className="r">Total Tax</th></tr>
              </thead>
              <tbody>
                {summary.rates.map((g) => (
                  <tr key={g.rate}>
                    <td><b>{formatRate(g.rate)}%</b></td>
                    <td className="r">₹ {formatINR(g.taxable)}</td>
                    <td className="r">₹ {formatINR(g.cgst)}</td>
                    <td className="r">₹ {formatINR(g.sgst)}</td>
                    <td className="r">₹ {formatINR(g.igst)}</td>
                    <td className="r"><b>₹ {formatINR(g.cgst + g.sgst + g.igst)}</b></td>
                  </tr>
                ))}
                {summary.rates.length === 0 && <tr><td colSpan={6} className="c muted empty-row">No invoices in this period.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="hint-card">
            The Excel report contains: <b>Summary</b> (B2B/B2C supply, tax heads, documents issued) · <b>B2B Invoices</b> · <b>B2C Invoices</b> · <b>Rate-wise Summary</b> · <b>HSN Summary</b> · <b>Purchases</b>.
          </div>
        </>
      )}
    </div>
  );
}
