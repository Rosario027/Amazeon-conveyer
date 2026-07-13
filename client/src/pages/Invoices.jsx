import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

import { monthStart, monthEnd } from '../utils/dates.js';
const d10 = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Invoices() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async (filters) => {
    setLoading(true);
    try { setRows(await api.invoices(filters)); setError(''); } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load({}); }, []);

  const apply = () => load({ q, type, from, to });
  const thisMonth = () => { setFrom(monthStart()); setTo(monthEnd()); load({ q, type, from: monthStart(), to: monthEnd() }); };
  const clearAll = () => { setQ(''); setType(''); setFrom(''); setTo(''); load({}); };

  const tax = (r) => (r.cgstAmount || 0) + (r.sgstAmount || 0) + (r.igstAmount || 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Invoices</h1>
        <div className="page-actions">
          <Link to="/invoices/new" className="btn btn-primary">+ New Invoice</Link>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="card filter-bar">
        <input className="filter-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} placeholder="Search invoice no / customer / GSTIN" />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="B2B">B2B</option>
          <option value="B2C">B2C</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn" onClick={apply}>Apply</button>
        <button className="btn btn-ghost" onClick={thisMonth}>This month</button>
        <button className="btn btn-ghost" onClick={clearAll}>Clear</button>
      </div>

      <div className="card table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice No</th><th>Date</th><th>Type</th><th>Customer</th><th>GSTIN</th>
              <th className="r">Taxable</th><th className="r">Tax</th><th className="r">Total</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.status === 'cancelled' ? 'row-cancelled' : ''} onClick={() => navigate(`/invoices/${r.id}`)}>
                <td><b>{r.invoiceNo}</b>{r.status === 'cancelled' && <span className="badge badge-red">CANCELLED</span>}</td>
                <td>{d10(r.invoiceDate)}</td>
                <td><span className={`badge ${r.invoiceType === 'B2B' ? 'badge-blue' : 'badge-orange'}`}>{r.invoiceType}</span></td>
                <td>{r.buyerName}</td>
                <td className="muted">{r.buyerGstin || '—'}</td>
                <td className="r">₹ {formatINR(r.subTotal)}</td>
                <td className="r">₹ {formatINR(tax(r))}</td>
                <td className="r"><b>₹ {formatINR(r.grandTotal)}</b></td>
                <td className="r">
                  <button className="mini-btn" onClick={(e) => { e.stopPropagation(); api.downloadInvoicePdf(r.id, r.invoiceNo).catch((err) => setError(err.message)); }}>PDF</button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="c muted empty-row">No invoices found — create your first one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
