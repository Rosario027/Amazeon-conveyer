import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import InvoicePreview from '../components/InvoicePreview.jsx';

export default function InvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => Promise.all([api.invoice(id), api.settings()])
    .then(([inv, s]) => { setInvoice(inv); setSettings(s); })
    .catch((e) => setError(e.message));

  useEffect(() => { load(); }, [id]);

  const downloadPdf = async () => {
    setBusy('pdf');
    try { await api.downloadInvoicePdf(id, invoice.invoiceNo); } catch (e) { setError(e.message); }
    setBusy('');
  };

  const cancelInvoice = async () => {
    if (!window.confirm(`Cancel invoice ${invoice.invoiceNo}? It keeps its number (GST numbering stays continuous) but is excluded from report values.`)) return;
    setBusy('cancel');
    try { await api.cancelInvoice(id); await load(); } catch (e) { setError(e.message); }
    setBusy('');
  };

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!invoice || !settings) return <div className="page"><div className="muted">Loading…</div></div>;

  return (
    <div className="page">
      <div className="page-head no-print">
        <h1>Invoice {invoice.invoiceNo}
          {invoice.status === 'cancelled' && <span className="badge badge-red">CANCELLED</span>}
          <span className={`badge ${invoice.invoiceType === 'B2B' ? 'badge-blue' : 'badge-orange'}`}>{invoice.invoiceType}</span>
          {invoice.project && (
            <button className="proj-tag" onClick={() => navigate(`/projects/${invoice.project.id}`)}>
              📁 {invoice.project.code} · {invoice.project.name}
            </button>
          )}
        </h1>
        <div className="page-actions">
          <button className="btn" onClick={() => navigate('/invoices')}>← All invoices</button>
          <button className="btn" onClick={() => window.print()}>Print</button>
          <button className="btn btn-primary" onClick={downloadPdf} disabled={busy === 'pdf'}>{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
          {invoice.status !== 'cancelled' && (
            <>
              <button className="btn" onClick={() => navigate(`/invoices/${id}/edit`)}>Edit</button>
              <button className="btn btn-danger" onClick={cancelInvoice} disabled={busy === 'cancel'}>Cancel Invoice</button>
            </>
          )}
        </div>
      </div>
      {invoice.commissionEnabled && invoice.commissionAmount > 0 && (
        <div className="comm-banner no-print">
          🔒 Internal — referral commission: <b>₹ {invoice.commissionAmount.toLocaleString('en-IN')}</b> to{' '}
          <b>{invoice.agent?.name || '(agent removed)'}</b>
          {invoice.commissionType === 'percent' && <> ({invoice.commissionRate}% of taxable value)</>}
          {' '}· tracked in Accounts → Commissions · not printed on the invoice
        </div>
      )}
      <div className="preview-wrap">
        <InvoicePreview invoice={invoice} settings={settings} />
      </div>
    </div>
  );
}
