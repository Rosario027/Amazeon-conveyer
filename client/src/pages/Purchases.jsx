// Purchases — manual entries and uploaded bills (PDF / image). Uploaded
// documents are stored in the database and can be retrieved any time.
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';

import { today, monthStart, monthEnd, localISO } from '../utils/dates.js';
const d10 = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

const emptyForm = () => ({
  purchaseDate: today(), vendorName: '', vendorGstin: '', billNo: '', description: '',
  taxableValue: '', cgst: '', sgst: '', igst: '', totalAmount: '', notes: '',
});

function readFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 10 * 1024 * 1024) return reject(new Error(`"${file.name}" is over 10MB.`));
    const reader = new FileReader();
    reader.onload = () => resolve({ filename: file.name, mimeType: file.type || 'application/octet-stream', dataBase64: reader.result });
    reader.onerror = () => reject(new Error(`Could not read "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

export default function Purchases() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [pendingFiles, setPendingFiles] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (filters = {}) => {
    try { setRows(await api.purchases(filters)); } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const autoTotal = () => {
    const t = (Number(form.taxableValue) || 0) + (Number(form.cgst) || 0) + (Number(form.sgst) || 0) + (Number(form.igst) || 0);
    if (t > 0) set({ totalAmount: String(Math.round(t * 100) / 100) });
  };

  const pickFiles = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    try {
      const read = await Promise.all(files.map(readFile));
      setPendingFiles((p) => [...p, ...read]);
      setError('');
    } catch (err) { setError(err.message); }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setForm({
      purchaseDate: localISO(new Date(p.purchaseDate)),
      vendorName: p.vendorName, vendorGstin: p.vendorGstin, billNo: p.billNo, description: p.description,
      taxableValue: p.taxableValue || '', cgst: p.cgst || '', sgst: p.sgst || '', igst: p.igst || '',
      totalAmount: p.totalAmount || '', notes: p.notes,
    });
    setPendingFiles([]);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (editingId) {
        await api.updatePurchase(editingId, form);
        if (pendingFiles.length) await api.addPurchaseFiles(editingId, pendingFiles);
        setNotice('Purchase updated.');
      } else {
        await api.createPurchase({ ...form, files: pendingFiles });
        setNotice('Purchase saved.');
      }
      setForm(emptyForm());
      setPendingFiles([]);
      setEditingId(null);
      setShowForm(false);
      await load({ from, to, q });
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete the purchase entry from ${p.vendorName}${p.files.length ? ` and its ${p.files.length} stored document(s)` : ''}?`)) return;
    try { await api.deletePurchase(p.id); await load({ from, to, q }); } catch (e) { setError(e.message); }
  };

  const removeFile = async (p, f) => {
    if (!window.confirm(`Delete stored document "${f.filename}"?`)) return;
    try { await api.deletePurchaseFile(p.id, f.id); await load({ from, to, q }); } catch (e) { setError(e.message); }
  };

  const totals = rows.reduce((acc, p) => ({
    taxable: acc.taxable + (p.taxableValue || 0),
    tax: acc.tax + (p.cgst || 0) + (p.sgst || 0) + (p.igst || 0),
    total: acc.total + (p.totalAmount || 0),
  }), { taxable: 0, tax: 0, total: 0 });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Purchases</h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(emptyForm()); setPendingFiles([]); setShowForm((v) => !v); }}>
            {showForm && !editingId ? 'Close' : '+ Add Purchase'}
          </button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert ok" onClick={() => setNotice('')}>{notice}</div>}

      {showForm && (
        <div className="card">
          <h2>{editingId ? 'Edit Purchase' : 'New Purchase'} <span className="muted h-sub">manual entry, document upload, or both</span></h2>
          <div className="form-grid">
            <label>Date<input type="date" value={form.purchaseDate} onChange={(e) => set({ purchaseDate: e.target.value })} /></label>
            <label>Vendor name<input value={form.vendorName} onChange={(e) => set({ vendorName: e.target.value })} placeholder="Supplier / shop name" /></label>
            <label>Vendor GSTIN<input value={form.vendorGstin} onChange={(e) => set({ vendorGstin: e.target.value.toUpperCase() })} maxLength={15} placeholder="optional" /></label>
            <label>Bill / Invoice no<input value={form.billNo} onChange={(e) => set({ billNo: e.target.value })} placeholder="optional" /></label>
            <label className="span2">Description<input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="What was purchased" /></label>
            <label>Taxable value (₹)<input type="number" step="any" value={form.taxableValue} onChange={(e) => set({ taxableValue: e.target.value })} onBlur={autoTotal} /></label>
            <label>CGST (₹)<input type="number" step="any" value={form.cgst} onChange={(e) => set({ cgst: e.target.value })} onBlur={autoTotal} /></label>
            <label>SGST (₹)<input type="number" step="any" value={form.sgst} onChange={(e) => set({ sgst: e.target.value })} onBlur={autoTotal} /></label>
            <label>IGST (₹)<input type="number" step="any" value={form.igst} onChange={(e) => set({ igst: e.target.value })} onBlur={autoTotal} /></label>
            <label>Bill total (₹)<input type="number" step="any" value={form.totalAmount} onChange={(e) => set({ totalAmount: e.target.value })} /></label>
            <label className="span2">Notes<input value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="optional" /></label>
          </div>

          <div className="upload-zone">
            <label className="btn btn-ghost file-btn">
              📎 Attach bill (PDF / image / doc — max 10MB each)
              <input type="file" multiple accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.csv" onChange={pickFiles} hidden />
            </label>
            {pendingFiles.map((f, i) => (
              <span key={i} className="file-chip">
                {f.filename}
                <button onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
          </div>

          <div className="page-actions" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy || !form.vendorName.trim()}>{busy ? 'Saving…' : editingId ? 'Save Changes' : 'Save Purchase'}</button>
          </div>
        </div>
      )}

      <div className="card filter-bar">
        <input className="filter-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load({ from, to, q })} placeholder="Search vendor / bill no / GSTIN" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn" onClick={() => load({ from, to, q })}>Apply</button>
        <button className="btn btn-ghost" onClick={() => { setFrom(monthStart()); setTo(monthEnd()); load({ from: monthStart(), to: monthEnd(), q }); }}>This month</button>
        <button className="btn btn-ghost" onClick={() => { setFrom(''); setTo(''); setQ(''); load({}); }}>Clear</button>
      </div>

      <div className="mini-stats">
        <span>Entries: <b>{rows.length}</b></span>
        <span>Taxable: <b>₹ {formatINR(totals.taxable)}</b></span>
        <span>Tax paid: <b>₹ {formatINR(totals.tax)}</b></span>
        <span>Total: <b>₹ {formatINR(totals.total)}</b></span>
      </div>

      <div className="card table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Vendor</th><th>Bill No</th><th>Description</th>
              <th className="r">Taxable</th><th className="r">Tax</th><th className="r">Total</th>
              <th>Documents</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{d10(p.purchaseDate)}</td>
                <td><b>{p.vendorName}</b>{p.vendorGstin && <div className="muted tiny">{p.vendorGstin}</div>}</td>
                <td>{p.billNo || '—'}</td>
                <td className="desc-cell">{p.description || '—'}</td>
                <td className="r">₹ {formatINR(p.taxableValue)}</td>
                <td className="r">₹ {formatINR((p.cgst || 0) + (p.sgst || 0) + (p.igst || 0))}</td>
                <td className="r"><b>₹ {formatINR(p.totalAmount)}</b></td>
                <td>
                  {p.files.length === 0 && <span className="muted tiny">manual</span>}
                  {p.files.map((f) => (
                    <span key={f.id} className="file-chip stored" title={`${f.filename} · ${kb(f.size)}`}>
                      <button className="chip-name" onClick={() => api.downloadPurchaseFile(p.id, f.id, f.filename).catch((e) => setError(e.message))}>
                        ⬇ {f.filename.length > 22 ? f.filename.slice(0, 20) + '…' : f.filename}
                      </button>
                      <button onClick={() => removeFile(p, f)}>×</button>
                    </span>
                  ))}
                </td>
                <td className="r nowrap">
                  <button className="mini-btn" onClick={() => startEdit(p)}>Edit</button>
                  <button className="mini-btn danger" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="c muted empty-row">No purchases recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
