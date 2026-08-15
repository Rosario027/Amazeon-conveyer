import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

const d10 = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page"><div className="muted">Loading…</div></div>;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dashboard <span className="muted h-sub">{data.month}</span></h1>
        <div className="page-actions">
          <Link to="/invoices/new" className="btn btn-primary">+ New Invoice</Link>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi kpi-blue">
          <div className="kpi-label">Sales this month</div>
          <div className="kpi-value">₹ {formatINR(data.sales.total)}</div>
          <div className="kpi-sub">{data.sales.count} invoice{data.sales.count === 1 ? '' : 's'} · taxable ₹ {formatINR(data.sales.taxable)}</div>
        </div>
        <div className="kpi kpi-orange">
          <div className="kpi-label">B2B / B2C split</div>
          <div className="kpi-value">{data.b2b.count} / {data.b2c.count}</div>
          <div className="kpi-sub">B2B ₹ {formatINR(data.b2b.total)} · B2C ₹ {formatINR(data.b2c.total)}</div>
        </div>
        <div className="kpi kpi-green">
          <div className="kpi-label">GST collected (output)</div>
          <div className="kpi-value">₹ {formatINR(data.gst.output)}</div>
          <div className="kpi-sub">input ₹ {formatINR(data.gst.input)} · net payable ₹ {formatINR(data.gst.net)}</div>
        </div>
        <div className="kpi kpi-slate">
          <div className="kpi-label">Purchases this month</div>
          <div className="kpi-value">₹ {formatINR(data.purchases.total)}</div>
          <div className="kpi-sub">{data.purchases.count} entr{data.purchases.count === 1 ? 'y' : 'ies'} recorded</div>
        </div>
        {data.projects && (
          <div className="kpi kpi-purple kpi-link" onClick={() => navigate('/projects')}>
            <div className="kpi-label">Projects receivable</div>
            <div className="kpi-value">₹ {formatINR(data.projects.receivable)}</div>
            <div className="kpi-sub">{data.projects.active} active project{data.projects.active === 1 ? '' : 's'} — tap to view</div>
          </div>
        )}
      </div>

      <div className="card table-card">
        <div className="card-head-row">
          <h2>Recent invoices</h2>
          <Link to="/invoices" className="mini-btn">view all</Link>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Invoice No</th><th>Date</th><th>Type</th><th>Customer</th><th className="r">Total</th></tr>
          </thead>
          <tbody>
            {data.recent.map((r) => (
              <tr key={r.id} className={r.status === 'cancelled' ? 'row-cancelled' : ''} onClick={() => navigate(`/invoices/${r.id}`)}>
                <td><b>{r.invoiceNo}</b>{r.status === 'cancelled' && <span className="badge badge-red">CANCELLED</span>}</td>
                <td>{d10(r.invoiceDate)}</td>
                <td><span className={`badge ${r.invoiceType === 'B2B' ? 'badge-blue' : 'badge-orange'}`}>{r.invoiceType}</span></td>
                <td>{r.buyerName}</td>
                <td className="r"><b>₹ {formatINR(r.grandTotal)}</b></td>
              </tr>
            ))}
            {data.recent.length === 0 && <tr><td colSpan={5} className="c muted empty-row">No invoices recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
