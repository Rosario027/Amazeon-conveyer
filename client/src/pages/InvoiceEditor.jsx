import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { computeTotals } from '../utils/calc.js';
import { formatINR, formatRate } from '../utils/money.js';
import { STATES, GST_RATES } from '../utils/states.js';

import { today, localISO } from '../utils/dates.js';

const emptyItem = () => ({ description: '', hsnCode: '', partNo: '', qty: 1, unit: 'Nos', rate: '', gstRate: 18 });

const emptyForm = (settings) => ({
  invoiceType: 'B2B',
  invoiceNo: '',
  invoiceDate: today(),
  buyerName: '',
  buyerGstin: '',
  buyerEmail: '',
  buyerPhone: '',
  billTo: '',
  shipTo: '',
  buyerStateName: settings?.stateName || 'Tamil Nadu',
  buyerStateCode: settings?.stateCode || '33',
  reverseCharge: false,
  poRefNo: '',
  paymentTerms: '',
  notes: '',
  items: [emptyItem()],
  projectId: '',
  // referral commission — internal only, never printed on the invoice
  commissionEnabled: false,
  agentId: '',
  commissionType: 'percent',
  commissionRate: '',
  commissionAmount: '',
});

export default function InvoiceEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editing = !!id;

  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [agents, setAgents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [nextNo, setNextNo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // customer autofill
  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState([]);
  const [showCust, setShowCust] = useState(false);
  const custTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const s = await api.settings();
      setSettings(s);
      api.agents().then(setAgents).catch(() => {});
      api.projects().then(setProjects).catch(() => {});
      if (editing) {
        const inv = await api.invoice(id);
        setForm({
          ...inv,
          invoiceDate: localISO(new Date(inv.invoiceDate)),
          items: inv.items.map((it) => ({ ...it })),
          projectId: inv.projectId || '',
          agentId: inv.agentId || '',
          commissionRate: inv.commissionRate || '',
          commissionAmount: inv.commissionAmount || '',
        });
      } else {
        const preselect = Number(searchParams.get('project')) || '';
        setForm({ ...emptyForm(s), projectId: preselect });
        api.nextInvoiceNo().then((r) => setNextNo(r.invoiceNo)).catch(() => {});
      }
    })().catch((e) => setError(e.message));
  }, [id]);

  const taxMode = useMemo(() => {
    if (!settings || !form) return 'intra';
    const b = (form.buyerStateCode || '').trim();
    return b && b !== settings.stateCode ? 'inter' : 'intra';
  }, [settings, form?.buyerStateCode]);

  const totals = useMemo(() => (form ? computeTotals({ ...form, taxMode }) : null), [form, taxMode]);

  if (!form || !settings) {
    return <div className="page"><h1>{editing ? 'Edit Invoice' : 'New Invoice'}</h1>{error ? <div className="alert error">{error}</div> : <div className="muted">Loading…</div>}</div>;
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setItem = (idx, patch) => setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (idx) => setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, i) => i !== idx) : f.items }));

  const searchCustomers = (q) => {
    setCustQuery(q);
    set({ buyerName: q });
    clearTimeout(custTimer.current);
    if (!q.trim()) { setCustResults([]); return; }
    custTimer.current = setTimeout(async () => {
      try {
        const list = await api.customers(q.trim());
        setCustResults(list);
        setShowCust(true);
      } catch { /* ignore */ }
    }, 250);
  };

  const pickCustomer = (c) => {
    set({
      buyerName: c.name,
      buyerGstin: c.gstin || '',
      buyerEmail: c.email || '',
      buyerPhone: c.phone || '',
      billTo: c.billTo || '',
      shipTo: c.shipTo || '',
      buyerStateName: c.stateName || settings.stateName,
      buyerStateCode: c.stateCode || settings.stateCode,
      invoiceType: c.gstin ? 'B2B' : form.invoiceType,
    });
    setShowCust(false);
  };

  const pickState = (code) => {
    const st = STATES.find((s) => s.code === code);
    set({ buyerStateCode: code, buyerStateName: st ? st.name : '' });
  };

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      const payload = { ...form, taxMode };
      const saved = editing ? await api.updateInvoice(id, payload) : await api.createInvoice(payload);
      navigate(`/invoices/${saved.id}`);
    } catch (e) {
      setError(e.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  const isInter = taxMode === 'inter';

  return (
    <div className="page">
      <div className="page-head">
        <h1>{editing ? `Edit ${form.invoiceNo}` : 'New Invoice'}</h1>
        <div className="page-actions">
          <button className="btn" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Save Invoice'}</button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      {/* ── B2B / B2C selector ── */}
      <div className="card">
        <div className="type-toggle">
          <button className={`type-btn ${form.invoiceType === 'B2B' ? 'sel' : ''}`} onClick={() => set({ invoiceType: 'B2B' })}>
            <b>B2B</b><span>Registered business — GSTIN required</span>
          </button>
          <button className={`type-btn ${form.invoiceType === 'B2C' ? 'sel' : ''}`} onClick={() => set({ invoiceType: 'B2C' })}>
            <b>B2C</b><span>Consumer / unregistered — no GSTIN</span>
          </button>
          <div className={`supply-badge ${isInter ? 'inter' : 'intra'}`}>
            {isInter ? 'Inter-State → IGST' : 'Intra-State → CGST + SGST'}
          </div>
        </div>
      </div>

      <div className="editor-grid">
        {/* ── Invoice meta ── */}
        <div className="card">
          <h2>Invoice Details</h2>
          <div className="form-grid">
            <label className="span2">Project
              <select value={form.projectId} onChange={(e) => set({ projectId: e.target.value })}>
                <option value="">— no project —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </label>
            <label>Invoice No
              <input value={form.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value })} placeholder={editing ? '' : `auto: ${nextNo || '…'}`} />
            </label>
            <label>Date
              <input type="date" value={form.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} />
            </label>
            <label>PO / Ref No
              <input value={form.poRefNo} onChange={(e) => set({ poRefNo: e.target.value })} placeholder="optional" />
            </label>
            <label>Payment Terms
              <input value={form.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder={settings.paymentTerms || 'e.g. 100% Advance'} />
            </label>
            <label className="check-label">
              <input type="checkbox" checked={form.reverseCharge} onChange={(e) => set({ reverseCharge: e.target.checked })} />
              Reverse charge applies
            </label>
          </div>
        </div>

        {/* ── Customer ── */}
        <div className="card">
          <h2>Customer {form.invoiceType === 'B2B' ? '(Business)' : '(Consumer)'}</h2>
          <div className="form-grid">
            <label className="span2 cust-search">
              Name
              <input
                value={form.buyerName}
                onChange={(e) => searchCustomers(e.target.value)}
                onFocus={() => custResults.length && setShowCust(true)}
                onBlur={() => setTimeout(() => setShowCust(false), 200)}
                placeholder="Start typing to search saved customers…"
              />
              {showCust && custResults.length > 0 && (
                <div className="cust-dropdown">
                  {custResults.map((c) => (
                    <button key={c.id} type="button" onMouseDown={() => pickCustomer(c)}>
                      <b>{c.name}</b>
                      <span>{c.gstin || 'No GSTIN'} · {c._count?.invoices ?? 0} invoices</span>
                    </button>
                  ))}
                </div>
              )}
            </label>
            {form.invoiceType === 'B2B' && (
              <label>GSTIN <span className="req">*</span>
                <input value={form.buyerGstin} onChange={(e) => set({ buyerGstin: e.target.value.toUpperCase() })} placeholder="33ABCDE1234F1Z5" maxLength={15} />
              </label>
            )}
            <label>State (Place of Supply)
              <select value={form.buyerStateCode} onChange={(e) => pickState(e.target.value)}>
                {STATES.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
              </select>
            </label>
            <label>Email
              <input value={form.buyerEmail} onChange={(e) => set({ buyerEmail: e.target.value })} placeholder="optional" />
            </label>
            <label>Phone
              <input value={form.buyerPhone} onChange={(e) => set({ buyerPhone: e.target.value })} placeholder="optional" />
            </label>
            <label className="span2">Bill To (address)
              <textarea rows={3} value={form.billTo} onChange={(e) => set({ billTo: e.target.value })} placeholder={'Street\nCity, PIN'} />
            </label>
            <label className="span2">
              <span className="label-row">Ship To (address)
                <button type="button" className="mini-btn" onClick={() => set({ shipTo: form.billTo })}>copy Bill To</button>
              </span>
              <textarea rows={3} value={form.shipTo} onChange={(e) => set({ shipTo: e.target.value })} placeholder="Same as Bill To if left empty" />
            </label>
          </div>
        </div>
      </div>

      {/* ── Line items ── */}
      <div className="card">
        <h2>Items</h2>
        <div className="items-table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>Description</th>
                <th style={{ width: 100 }}>HSN/SAC</th>
                <th style={{ width: 110 }}>Part No</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 76 }}>Unit</th>
                <th style={{ width: 110 }}>Rate (₹)</th>
                <th style={{ width: 92 }}>GST %</th>
                <th style={{ width: 110 }} className="r">Amount</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {form.items.map((it, i) => (
                <tr key={i}>
                  <td className="c muted">{i + 1}</td>
                  <td><input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Product / service description" /></td>
                  <td><input value={it.hsnCode} onChange={(e) => setItem(i, { hsnCode: e.target.value })} placeholder="8428" /></td>
                  <td><input value={it.partNo} onChange={(e) => setItem(i, { partNo: e.target.value })} placeholder="optional" /></td>
                  <td><input type="number" min="0" step="any" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} /></td>
                  <td>
                    <select value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })}>
                      {['Nos', 'Pcs', 'Set', 'Mtr', 'Kg', 'Ltr', 'Box', 'Roll', 'Pair', 'Unit'].map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td><input type="number" min="0" step="any" value={it.rate} onChange={(e) => setItem(i, { rate: e.target.value })} /></td>
                  <td>
                    <select value={it.gstRate} onChange={(e) => setItem(i, { gstRate: Number(e.target.value) })}>
                      {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </td>
                  <td className="r amount-cell">{formatINR((Number(it.qty) || 0) * (Number(it.rate) || 0))}</td>
                  <td className="c"><button type="button" className="row-x" onClick={() => removeItem(i)} title="Remove line">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-ghost" onClick={addItem}>+ Add line</button>
      </div>

      {/* ── Referral commission (internal only) ── */}
      <div className="card">
        <h2>Referral Commission <span className="muted h-sub">internal reference only — never printed on the invoice</span></h2>
        <div className="comm-row">
          <div className="comm-yesno">
            <button type="button" className={`pill ${!form.commissionEnabled ? 'sel' : ''}`} onClick={() => set({ commissionEnabled: false })}>No</button>
            <button type="button" className={`pill ${form.commissionEnabled ? 'sel' : ''}`} onClick={() => set({ commissionEnabled: true })}>Yes</button>
          </div>
          {form.commissionEnabled && (
            <>
              <label className="comm-field">Agent
                <select value={form.agentId} onChange={(e) => set({ agentId: e.target.value })}>
                  <option value="">— select agent —</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.pan})</option>)}
                </select>
              </label>
              <label className="comm-field">Basis
                <select value={form.commissionType} onChange={(e) => set({ commissionType: e.target.value })}>
                  <option value="percent">Percentage of taxable value</option>
                  <option value="amount">Fixed amount</option>
                </select>
              </label>
              {form.commissionType === 'percent' ? (
                <label className="comm-field">Percentage (%)
                  <input type="number" min="0" max="100" step="any" value={form.commissionRate} onChange={(e) => set({ commissionRate: e.target.value })} />
                </label>
              ) : (
                <label className="comm-field">Amount (₹)
                  <input type="number" min="0" step="any" value={form.commissionAmount} onChange={(e) => set({ commissionAmount: e.target.value })} />
                </label>
              )}
              <div className="comm-calc">
                Commission: <b>₹ {formatINR(form.commissionType === 'percent'
                  ? (totals.subTotal * (Number(form.commissionRate) || 0)) / 100
                  : Number(form.commissionAmount) || 0)}</b>
                {form.commissionType === 'percent' && <span className="muted"> ({form.commissionRate || 0}% of taxable ₹ {formatINR(totals.subTotal)})</span>}
              </div>
            </>
          )}
          {agents.length === 0 && form.commissionEnabled && (
            <div className="hint">No agents registered yet — add them in <b>Accounts → Agents</b> first.</div>
          )}
        </div>
      </div>

      {/* ── Totals ── */}
      <div className="editor-grid">
        <div className="card">
          <h2>Notes</h2>
          <textarea rows={4} className="notes-box" value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Internal notes (not printed on the invoice)" />
        </div>
        <div className="card totals-card">
          <h2>Totals</h2>
          <table className="totals-mini"><tbody>
            <tr><td>Taxable Value</td><td className="r">₹ {formatINR(totals.subTotal)}</td></tr>
            {totals.taxBreakup.map((g, i) => isInter ? (
              <tr key={i}><td>IGST @ {formatRate(g.rate)}%</td><td className="r">₹ {formatINR(g.igst)}</td></tr>
            ) : (
              <React.Fragment key={i}>
                <tr><td>CGST @ {formatRate(g.half)}%</td><td className="r">₹ {formatINR(g.cgst)}</td></tr>
                <tr><td>SGST @ {formatRate(g.half)}%</td><td className="r">₹ {formatINR(g.sgst)}</td></tr>
              </React.Fragment>
            ))}
            {Math.abs(totals.roundOff) >= 0.005 && <tr><td>Round Off</td><td className="r">₹ {formatINR(totals.roundOff)}</td></tr>}
            <tr className="grand"><td>Grand Total</td><td className="r">₹ {formatINR(totals.grandTotal)}</td></tr>
          </tbody></table>
          <div className="words-mini">{totals.amountWords}</div>
          <button className="btn btn-primary btn-block" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Save Invoice'}</button>
        </div>
      </div>
    </div>
  );
}
