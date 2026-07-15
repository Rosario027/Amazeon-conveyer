// Visual invoice — the on-screen twin of the server PDF (same data, same
// computeTotals). Used on the invoice view page and for browser printing.
import React from 'react';
import { computeTotals } from '../utils/calc.js';
import { formatINR, formatRate } from '../utils/money.js';
import { LOGO_SRC } from '../logo.jsx';

const fmtDate = (d) => {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
};

export default function InvoicePreview({ invoice, settings }) {
  if (!invoice || !settings) return null;
  const totals = computeTotals(invoice);
  const isInter = totals.taxMode === 'inter';
  const items = totals.items;
  const showPart = items.some((it) => (it.partNo || '').trim() !== '');
  const payLines = [];
  if (settings.showBankDetails) {
    if (settings.bankAccountName) payLines.push(`A/C Name: ${settings.bankAccountName}`);
    if (settings.bankName) payLines.push(`Bank: ${settings.bankName}`);
    if (settings.bankAccount) payLines.push(`A/C No: ${settings.bankAccount}`);
    if (settings.bankIfsc) payLines.push(`IFSC: ${settings.bankIfsc}${settings.bankBranch ? ` (${settings.bankBranch})` : ''}`);
  }
  if (settings.showUpi && settings.upiId) payLines.push(`UPI: ${settings.upiId}`);

  return (
    <div className={`inv-sheet ${invoice.status === 'cancelled' ? 'inv-cancelled' : ''}`}>
      {invoice.status === 'cancelled' && <div className="inv-cancel-stamp">CANCELLED</div>}

      <header className="inv-head">
        <div className="inv-logo">
          <img src={settings.logoDataUrl || LOGO_SRC} alt="logo" />
        </div>
        <div className="inv-co">
          <div className="inv-co-name">{settings.companyName}</div>
          {settings.tagline && <div className="inv-co-tag">{settings.tagline.toUpperCase()}</div>}
          {(settings.addressLines || []).map((l, i) => <div key={i} className="inv-small">{l}</div>)}
          {settings.phone && <div className="inv-small">Mob: {settings.phone}</div>}
          {settings.email && <div className="inv-small">{settings.email}</div>}
          <div className="inv-small inv-bold">GSTIN: {settings.gstin || '-'}</div>
          <div className="inv-small">State: {settings.stateName} (Code: {settings.stateCode})</div>
        </div>
        <div className="inv-title-block">
          <div className="inv-title">{settings.invoiceTitle || 'TAX INVOICE'}</div>
          <div className="inv-type">{invoice.invoiceType === 'B2C' ? 'B2C — Unregistered Recipient' : 'B2B — Registered Recipient'}</div>
          <table className="inv-meta-table"><tbody>
            <tr><td>Invoice No</td><td>{invoice.invoiceNo || '(auto)'}</td></tr>
            <tr><td>Date</td><td>{fmtDate(invoice.invoiceDate || new Date())}</td></tr>
            <tr><td>Place of Supply</td><td>{invoice.placeOfSupply || (invoice.buyerStateName ? `${invoice.buyerStateName} (${invoice.buyerStateCode})` : '-')}</td></tr>
            <tr><td>Reverse Charge</td><td>{invoice.reverseCharge ? 'Yes' : 'No'}</td></tr>
          </tbody></table>
        </div>
      </header>

      <div className="inv-rule" />

      <div className="inv-strip">
        <span><em>PO / Ref No:</em> <b>{invoice.poRefNo || '-'}</b></span>
        <span><em>Payment Terms:</em> <b>{invoice.paymentTerms || settings.paymentTerms || '-'}</b></span>
        <span><em>Supply Type:</em> <b>{isInter ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}</b></span>
      </div>

      <div className="inv-parties">
        <div className="inv-party">
          <div className="inv-party-head">BILL TO</div>
          <div className="inv-party-body">
            <div className="inv-bold">{invoice.buyerName || '—'}</div>
            {String(invoice.billTo || '').split('\n').filter(Boolean).map((l, i) => <div key={i} className="inv-small">{l}</div>)}
            {invoice.buyerPhone && <div className="inv-small">Phone: {invoice.buyerPhone}</div>}
            {invoice.buyerEmail && <div className="inv-small">Email: {invoice.buyerEmail}</div>}
            {invoice.buyerGstin && <div className="inv-small inv-bold">GSTIN: {invoice.buyerGstin}</div>}
            {invoice.buyerStateName && <div className="inv-small">State: {invoice.buyerStateName} (Code: {invoice.buyerStateCode || '-'})</div>}
          </div>
        </div>
        <div className="inv-party">
          <div className="inv-party-head">SHIP TO</div>
          <div className="inv-party-body">
            <div className="inv-bold">{invoice.buyerName || '—'}</div>
            {String(invoice.shipTo || invoice.billTo || '').split('\n').filter(Boolean).map((l, i) => <div key={i} className="inv-small">{l}</div>)}
          </div>
        </div>
      </div>

      <table className="inv-items">
        <thead>
          <tr>
            <th className="c">SL</th>
            <th>DESCRIPTION</th>
            <th className="c">HSN/SAC</th>
            {showPart && <th className="c">PART NO</th>}
            <th className="c">QTY</th>
            <th className="r">RATE</th>
            <th className="c">GST%</th>
            <th className="r">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className="c">{i + 1}</td>
              <td>{it.description}</td>
              <td className="c">{it.hsnCode}</td>
              {showPart && <td className="c">{it.partNo}</td>}
              <td className="c">{formatINR(it.qty, false)} {it.unit || ''}</td>
              <td className="r">{formatINR(it.rate)}</td>
              <td className="c">{formatRate(it.gstRate)}%</td>
              <td className="r">{formatINR(it.taxable)}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td className="c" colSpan={showPart ? 8 : 7}>No items yet</td></tr>
          )}
        </tbody>
      </table>

      <div className="inv-totals-row">
        <div className="inv-totals-spacer" />
        <table className="inv-totals"><tbody>
          <tr><td>Taxable Value</td><td className="r">₹ {formatINR(totals.subTotal)}</td></tr>
          {totals.taxBreakup.map((g, i) => isInter ? (
            <tr key={i}><td>IGST @ {formatRate(g.rate)}%</td><td className="r">₹ {formatINR(g.igst)}</td></tr>
          ) : (
            <React.Fragment key={i}>
              <tr><td>CGST @ {formatRate(g.half)}%</td><td className="r">₹ {formatINR(g.cgst)}</td></tr>
              <tr><td>SGST @ {formatRate(g.half)}%</td><td className="r">₹ {formatINR(g.sgst)}</td></tr>
            </React.Fragment>
          ))}
          {Math.abs(totals.roundOff) >= 0.005 && (
            <tr><td>Round Off</td><td className="r">₹ {formatINR(totals.roundOff)}</td></tr>
          )}
          <tr className="inv-grand"><td>TOTAL</td><td className="r">₹ {formatINR(totals.grandTotal)}</td></tr>
        </tbody></table>
      </div>

      <div className="inv-words"><b>Amount in Words:</b> <i>{totals.amountWords}</i></div>

      <div className="inv-rule thin" />

      <footer className="inv-foot">
        <div className="inv-foot-left">
          {payLines.length > 0 && <div className="inv-foot-head">Payment Details</div>}
          {payLines.map((l, i) => <div key={i} className="inv-small">{l}</div>)}
          {(settings.termsLines || []).filter(Boolean).length > 0 && <div className="inv-foot-head">Terms</div>}
          {(settings.termsLines || []).filter(Boolean).map((l, i) => <div key={i} className="inv-tiny">• {l}</div>)}
          {settings.declaration && <div className="inv-tiny inv-italic">{settings.declaration}</div>}
          {(settings.footerLines || []).filter(Boolean).map((l, i) => <div key={i} className="inv-tiny inv-muted">{l}</div>)}
        </div>
        <div className="inv-foot-right">
          <div className="inv-bold">For {settings.companyName}</div>
          <div className="inv-sign-space">
            {settings.signatureDataUrl && <img src={settings.signatureDataUrl} alt="signature" />}
          </div>
          <div className="inv-sign-line" />
          <div className="inv-tiny inv-muted">{settings.signatory || 'Authorised Signatory'}</div>
        </div>
      </footer>
    </div>
  );
}
