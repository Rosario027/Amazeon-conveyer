// Invoice Settings — every printable element of the invoice is editable
// here: company block, branding, numbering, payment settings, and the
// boilerplate lines that appear at the bottom of the invoice.
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { LOGO_SRC } from '../logo.jsx';
import { STATES } from '../utils/states.js';

function fileToDataUrl(file, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) return reject(new Error(`"${file.name}" is over 2MB — please use a smaller image.`));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

const linesToText = (arr) => (arr || []).join('\n');
const textToLines = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);

export default function Settings() {
  const [s, setS] = useState(null);
  const [addressText, setAddressText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [termsText, setTermsText] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.settings().then((data) => {
      setS(data);
      setAddressText(linesToText(data.addressLines));
      setFooterText(linesToText(data.footerLines));
      setTermsText(linesToText(data.termsLines));
    }).catch((e) => setError(e.message));
  }, []);

  if (!s) return <div className="page"><h1>Invoice Settings</h1>{error ? <div className="alert error">{error}</div> : <div className="muted">Loading…</div>}</div>;

  const set = (patch) => { setS((v) => ({ ...v, ...patch })); setSaved(false); };

  const pickImage = async (e, field) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { set({ [field]: await fileToDataUrl(file) }); setError(''); } catch (err) { setError(err.message); }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...s,
        addressLines: textToLines(addressText),
        footerLines: textToLines(footerText),
        termsLines: textToLines(termsText),
        nextInvoiceSeq: Number(s.nextInvoiceSeq) || 1,
      };
      const fresh = await api.saveSettings(payload);
      setS(fresh);
      setSaved(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Invoice Settings</h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Settings'}</button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {saved && <div className="alert ok">Settings saved — new invoices and PDFs use them immediately.</div>}

      <div className="card">
        <h2>Company & GST</h2>
        <div className="form-grid">
          <label>Company name<input value={s.companyName} onChange={(e) => set({ companyName: e.target.value })} /></label>
          <label>Tagline<input value={s.tagline} onChange={(e) => set({ tagline: e.target.value })} /></label>
          <label className="span2">Address (one line per row)
            <textarea rows={3} value={addressText} onChange={(e) => { setAddressText(e.target.value); setSaved(false); }} placeholder={'12, Industrial Estate\nCoimbatore, 641021'} />
          </label>
          <label>GSTIN<input value={s.gstin} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} maxLength={15} placeholder="33ABCDE1234F1Z5" /></label>
          <label>State
            <select value={s.stateCode} onChange={(e) => { const st = STATES.find((x) => x.code === e.target.value); set({ stateCode: e.target.value, stateName: st ? st.name : s.stateName }); }}>
              {STATES.map((st) => <option key={st.code} value={st.code}>{st.code} — {st.name}</option>)}
            </select>
          </label>
          <label>Email<input value={s.email} onChange={(e) => set({ email: e.target.value })} /></label>
          <label>Phone<input value={s.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
        </div>
      </div>

      <div className="card">
        <h2>Branding</h2>
        <div className="brand-row">
          <div className="brand-slot">
            <div className="brand-slot-label">Logo (shown on invoices)</div>
            {s.logoDataUrl ? <img className="brand-img" src={s.logoDataUrl} alt="logo" /> : <img className="brand-img" src={LOGO_SRC} alt="company logo (default)" />}
            <div className="brand-btns">
              <label className="btn btn-ghost file-btn">Upload<input type="file" accept="image/*" onChange={(e) => pickImage(e, 'logoDataUrl')} hidden /></label>
              {s.logoDataUrl && <button className="btn btn-ghost" onClick={() => set({ logoDataUrl: null })}>Remove</button>}
            </div>
          </div>
          <div className="brand-slot">
            <div className="brand-slot-label">Signature (optional)</div>
            {s.signatureDataUrl ? <img className="brand-img" src={s.signatureDataUrl} alt="signature" /> : <div className="brand-empty">No signature uploaded</div>}
            <div className="brand-btns">
              <label className="btn btn-ghost file-btn">Upload<input type="file" accept="image/*" onChange={(e) => pickImage(e, 'signatureDataUrl')} hidden /></label>
              {s.signatureDataUrl && <button className="btn btn-ghost" onClick={() => set({ signatureDataUrl: null })}>Remove</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Invoice Numbering & Title</h2>
        <div className="form-grid">
          <label>Invoice title<input value={s.invoiceTitle} onChange={(e) => set({ invoiceTitle: e.target.value })} placeholder="TAX INVOICE" /></label>
          <label>Number prefix<input value={s.invoicePrefix} onChange={(e) => set({ invoicePrefix: e.target.value })} placeholder="AMZ-" /></label>
          <label>Next number
            <input type="number" min="1" value={s.nextInvoiceSeq} onChange={(e) => set({ nextInvoiceSeq: e.target.value })} />
          </label>
          <div className="hint span2">Next invoice will be <b>{s.invoicePrefix}{String(Number(s.nextInvoiceSeq) || 1).padStart(4, '0')}</b>. You can also type any number manually while creating an invoice.</div>
        </div>
      </div>

      <div className="card">
        <h2>Payment Settings</h2>
        <div className="form-grid">
          <label>Default payment terms<input value={s.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder="100% Advance / Net 30" /></label>
          <label>Account holder name<input value={s.bankAccountName} onChange={(e) => set({ bankAccountName: e.target.value })} /></label>
          <label>Bank name<input value={s.bankName} onChange={(e) => set({ bankName: e.target.value })} /></label>
          <label>Account number<input value={s.bankAccount} onChange={(e) => set({ bankAccount: e.target.value })} /></label>
          <label>IFSC<input value={s.bankIfsc} onChange={(e) => set({ bankIfsc: e.target.value.toUpperCase() })} /></label>
          <label>Branch<input value={s.bankBranch} onChange={(e) => set({ bankBranch: e.target.value })} /></label>
          <label>UPI ID<input value={s.upiId} onChange={(e) => set({ upiId: e.target.value })} placeholder="business@upi" /></label>
          <label className="check-label"><input type="checkbox" checked={s.showBankDetails} onChange={(e) => set({ showBankDetails: e.target.checked })} />Show bank details on invoice</label>
          <label className="check-label"><input type="checkbox" checked={s.showUpi} onChange={(e) => set({ showUpi: e.target.checked })} />Show UPI on invoice</label>
        </div>
      </div>

      <div className="card">
        <h2>Invoice Boilerplate (bottom of invoice)</h2>
        <div className="form-grid">
          <label className="span2">Terms lines (one per row — printed as bullets)
            <textarea rows={3} value={termsText} onChange={(e) => { setTermsText(e.target.value); setSaved(false); }} />
          </label>
          <label className="span2">Footer lines (one per row — fine print)
            <textarea rows={3} value={footerText} onChange={(e) => { setFooterText(e.target.value); setSaved(false); }} />
          </label>
          <label className="span2">Declaration
            <textarea rows={2} value={s.declaration} onChange={(e) => set({ declaration: e.target.value })} />
          </label>
          <label>Signatory label<input value={s.signatory} onChange={(e) => set({ signatory: e.target.value })} placeholder="Authorised Signatory" /></label>
        </div>
      </div>

      <div className="save-bar">
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Settings'}</button>
      </div>
    </div>
  );
}
