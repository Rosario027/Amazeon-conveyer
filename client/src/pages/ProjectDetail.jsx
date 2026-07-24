// Project detail — everything about one project in five tabs:
//   Overview   P&L breakdown + recent activity
//   Customer   invoices raised in this project + payment tranches → receivable
//   Supplier   committed payable + payments → auto balance
//   Expenses   company-borne vs customer-billable
//   Consultant referral / consultant payouts (+ invoice commissions, read-only)
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatINR } from '../utils/money.js';
import { today, localISO } from '../utils/dates.js';

const money = (n) => `₹ ${formatINR(n)}`;
const d10 = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const MODES = ['Bank', 'Cash', 'UPI', 'Card', 'Other'];

const emptyPay = (type) => ({ type, chargeTo: type === 'expense' ? 'company' : '', payDate: today(), amount: '', mode: 'Bank', refNo: '', description: '', partyName: '', agentId: '' });

// Compact add/edit form used by every tab.
function PayForm({ initial, agents, onSave, onCancel, busy, labels }) {
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [initial]);
  const set = (patch) => setF((v) => ({ ...v, ...patch }));
  return (
    <div className="pay-form">
      {f.type === 'expense' && (
        <label className="comm-field">Borne by
          <select value={f.chargeTo} onChange={(e) => set({ chargeTo: e.target.value })}>
            <option value="company">Company (project cost)</option>
            <option value="customer">Customer (billable — adds to receivable)</option>
          </select>
        </label>
      )}
      {f.type === 'consultant' && (
        <label className="comm-field">Agent (optional)
          <select value={f.agentId || ''} onChange={(e) => set({ agentId: e.target.value })}>
            <option value="">— not a registered agent —</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.pan})</option>)}
          </select>
        </label>
      )}
      {(f.type === 'consultant' || f.type === 'expense') && (
        <label className="comm-field">{f.type === 'consultant' ? 'Consultant name' : 'Paid to'}
          <input value={f.partyName} onChange={(e) => set({ partyName: e.target.value })} placeholder="optional" />
        </label>
      )}
      <label className="comm-field">Date
        <input type="date" value={f.payDate} onChange={(e) => set({ payDate: e.target.value })} />
      </label>
      <label className="comm-field">Amount (₹)
        <input type="number" min="0" step="any" value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
      </label>
      <label className="comm-field">Mode
        <select value={f.mode} onChange={(e) => set({ mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
      </label>
      <label className="comm-field">Ref
        <input value={f.refNo} onChange={(e) => set({ refNo: e.target.value })} placeholder="txn / cheque" />
      </label>
      <label className="comm-field pay-desc">{labels?.desc || 'Description'}
        <input value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder={labels?.descPh || 'optional'} />
      </label>
      <div className="pay-form-btns">
        {onCancel && <button className="btn" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-primary" onClick={() => onSave(f)} disabled={busy || !(Number(f.amount) > 0)}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function PayTable({ rows, onEdit, onDelete, showParty = true }) {
  if (!rows.length) return <div className="muted empty-row" style={{ textAlign: 'center' }}>Nothing recorded yet.</div>;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Date</th>{showParty && <th>Party</th>}<th>Description</th><th>Mode</th><th>Ref</th><th className="r">Amount</th><th /></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} style={{ cursor: 'default' }}>
              <td className="nowrap">{d10(p.payDate)}</td>
              {showParty && <td>{p.agent?.name || p.partyName || '—'}</td>}
              <td className="desc-cell" title={p.description}>
                {p.description || '—'}
                {p.type === 'expense' && <span className={`badge ${p.chargeTo === 'customer' ? 'badge-orange' : 'badge-slate'}`}>{p.chargeTo === 'customer' ? 'billable' : 'company'}</span>}
              </td>
              <td>{p.mode}</td>
              <td className="muted">{p.refNo || '—'}</td>
              <td className="r"><b>{money(p.amount)}</b></td>
              <td className="r nowrap">
                <button className="mini-btn" onClick={() => onEdit(p)}>Edit</button>
                <button className="mini-btn danger" onClick={() => onDelete(p)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [proj, setProj] = useState(null);
  const [settings, setSettings] = useState(null);
  const [agents, setAgents] = useState([]);
  const [tab, setTab] = useState('overview');
  const [addType, setAddType] = useState(''); // which tab's add-form is open
  const [editPay, setEditPay] = useState(null);
  const [editProj, setEditProj] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.project(id).then(setProj).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api.agents().then(setAgents).catch(() => {});
    api.settings().then(setSettings).catch(() => {});
  }, [id]);

  if (error && !proj) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!proj) return <div className="page"><div className="muted">Loading…</div></div>;

  const s = proj.summary;
  const o1 = settings?.owner1Name || 'Owner 1';
  const o2 = settings?.owner2Name || 'Owner 2';
  const pays = (type) => proj.payments.filter((p) => p.type === type);
  const expenses = pays('expense');

  const savePayment = async (f) => {
    setBusy(true);
    setError('');
    try {
      if (editPay) await api.updateProjectPayment(proj.id, editPay.id, f);
      else await api.addProjectPayment(proj.id, f);
      setAddType('');
      setEditPay(null);
      await load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const deletePayment = async (p) => {
    if (!window.confirm(`Delete this ${money(p.amount)} entry? Balances update automatically.`)) return;
    try { await api.deleteProjectPayment(proj.id, p.id); await load(); } catch (e) { setError(e.message); }
  };

  const startEdit = (p) => {
    setEditPay(p);
    setAddType(p.type);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveProject = async () => {
    setBusy(true);
    try {
      await api.updateProject(proj.id, editProj);
      setEditProj(null);
      await load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const toggleStatus = async () => {
    try { await api.updateProject(proj.id, { status: proj.status === 'active' ? 'completed' : 'active' }); await load(); } catch (e) { setError(e.message); }
  };

  const removeProject = async () => {
    if (!window.confirm(`Delete project ${proj.name}? All its payment records will be removed (invoices must be unlinked first).`)) return;
    try { await api.deleteProject(proj.id); navigate('/projects'); } catch (e) { setError(e.message); }
  };

  const activity = [
    ...proj.invoices.map((i) => ({ date: i.invoiceDate, text: `Invoice ${i.invoiceNo} — ${i.buyerName}`, amount: i.grandTotal, kind: 'in', cancelled: i.status === 'cancelled' })),
    ...proj.payments.map((p) => ({
      date: p.payDate,
      text: p.type === 'customer-payment' ? `Customer payment${p.refNo ? ` (${p.refNo})` : ''}`
        : p.type === 'supplier-payment' ? `Supplier payment${p.description ? ` — ${p.description}` : ''}`
        : p.type === 'consultant' ? `Consultant — ${p.agent?.name || p.partyName || ''}`
        : `Expense (${p.chargeTo}) — ${p.description || ''}`,
      amount: p.amount,
      kind: p.type === 'customer-payment' ? 'in' : 'out',
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

  const formFor = (type, labels) => (addType === type || (editPay && editPay.type === type)) && (
    <PayForm
      initial={editPay ? { ...editPay, payDate: localISO(new Date(editPay.payDate)), agentId: editPay.agentId || '' } : emptyPay(type)}
      agents={agents}
      busy={busy}
      labels={labels}
      onSave={savePayment}
      onCancel={() => { setAddType(''); setEditPay(null); }}
    />
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>
          {proj.name}
          <span className="badge badge-blue">{proj.code}</span>
          <span className={`badge ${proj.status === 'active' ? 'badge-orange' : 'badge-slate'}`}>{proj.status}</span>
        </h1>
        <div className="page-actions">
          <button className="btn" onClick={() => navigate('/projects')}>← Projects</button>
          <button className="btn" onClick={() => setEditProj(editProj ? null : { name: proj.name, customerName: proj.customerName, supplierName: proj.supplierName, supplierPayable: proj.supplierPayable, owner1Share: proj.owner1Share, notes: proj.notes })}>Edit</button>
          <button className="btn" onClick={toggleStatus}>{proj.status === 'active' ? 'Mark Completed' : 'Reopen'}</button>
          <button className="btn btn-primary" onClick={() => navigate(`/invoices/new?project=${proj.id}`)}>+ Raise Invoice</button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      {editProj && (
        <div className="card">
          <h2>Edit Project</h2>
          <div className="form-grid">
            <label>Name<input value={editProj.name} onChange={(e) => setEditProj({ ...editProj, name: e.target.value })} /></label>
            <label>Customer<input value={editProj.customerName} onChange={(e) => setEditProj({ ...editProj, customerName: e.target.value })} /></label>
            <label>Supplier<input value={editProj.supplierName} onChange={(e) => setEditProj({ ...editProj, supplierName: e.target.value })} /></label>
            <label>Total payable to supplier (₹)<input type="number" min="0" step="any" value={editProj.supplierPayable} onChange={(e) => setEditProj({ ...editProj, supplierPayable: e.target.value })} /></label>
            <label>{o1}'s share of P&amp;L (%)
              <input type="number" min="0" max="100" step="any" value={editProj.owner1Share} onChange={(e) => setEditProj({ ...editProj, owner1Share: e.target.value })} />
            </label>
            <div className="hint">Split for this project: <b>{o1} {Number(editProj.owner1Share) || 0}%</b> · <b>{o2} {Math.round((100 - (Number(editProj.owner1Share) || 0)) * 100) / 100}%</b> — applies to profit and loss alike.</div>
            <label className="span2">Notes<input value={editProj.notes} onChange={(e) => setEditProj({ ...editProj, notes: e.target.value })} /></label>
          </div>
          <div className="page-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-danger" onClick={removeProject}>Delete Project</button>
            <button className="btn" onClick={() => setEditProj(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveProject} disabled={busy}>Save</button>
          </div>
        </div>
      )}

      <div className="kpi-grid">
        <div className={`kpi ${s.pnl < 0 ? 'kpi-red' : 'kpi-green'}`}>
          <div className="kpi-label">Project P&amp;L <span className="badge badge-amber">split {s.owner1Share}／{s.owner2Share}</span></div>
          <div className="kpi-value" style={{ color: s.pnl < 0 ? 'var(--red)' : 'var(--green)' }}>{money(s.pnl)}</div>
          <div className="kpi-sub">{o1} {money(s.pnlOwner1)} · {o2} {money(s.pnlOwner2)}</div>
        </div>
        <div className="kpi kpi-orange">
          <div className="kpi-label">Amount receivable</div>
          <div className="kpi-value">{money(s.receivable)}</div>
          <div className="kpi-sub">invoiced {money(s.invoiced)} · received {money(s.customerPaid)}</div>
        </div>
        <div className="kpi kpi-blue">
          <div className="kpi-label">Supplier balance</div>
          <div className="kpi-value">{money(s.supplierBalance)}</div>
          <div className="kpi-sub">payable {money(s.supplierPayable)} · paid {money(s.supplierPaid)}</div>
        </div>
        <div className="kpi kpi-slate">
          <div className="kpi-label">Net cash</div>
          <div className="kpi-value">{money(s.netCash)}</div>
          <div className="kpi-sub">in {money(s.cashIn)} · out {money(s.cashOut)}</div>
        </div>
      </div>

      <div className="tabs">
        {['overview', 'customer', 'supplier', 'expenses', 'consultant'].map((t) => (
          <button key={t} className={`tab ${tab === t ? 'sel' : ''}`} onClick={() => { setTab(t); setAddType(''); setEditPay(null); }}>
            {t === 'overview' ? 'Overview' : t === 'customer' ? 'Customer' : t === 'supplier' ? 'Supplier' : t === 'expenses' ? 'Expenses' : 'Consultant'}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {tab === 'overview' && (
        <div className="editor-grid">
          <div className="card">
            <h2>P&amp;L breakdown</h2>
            <table className="totals-mini"><tbody>
              <tr><td>Invoiced to customer</td><td className="r">{money(s.invoiced)}</td></tr>
              <tr><td>Billable expenses (charged to customer)</td><td className="r">{money(s.billableExpenses)}</td></tr>
              <tr><td><b>Income</b></td><td className="r"><b>{money(s.income)}</b></td></tr>
              <tr><td>Supplier cost {s.supplierPaid > s.supplierPayable ? '(paid exceeds committed)' : '(committed)'}</td><td className="r">− {money(Math.max(s.supplierPayable, s.supplierPaid))}</td></tr>
              <tr><td>Company expenses</td><td className="r">− {money(s.companyExpenses)}</td></tr>
              <tr><td>Consultant payouts</td><td className="r">− {money(s.consultantPaid)}</td></tr>
              <tr><td>Invoice referral commissions</td><td className="r">− {money(s.invoiceCommissions)}</td></tr>
              <tr className="grand"><td>Project P&amp;L</td><td className="r" style={{ color: s.pnl < 0 ? 'var(--red)' : 'var(--green)' }}>{money(s.pnl)}</td></tr>
              <tr><td>{o1}'s share ({s.owner1Share}%)</td><td className="r" style={{ color: s.pnlOwner1 < 0 ? 'var(--red)' : 'var(--green)' }}>{money(s.pnlOwner1)}</td></tr>
              <tr><td>{o2}'s share ({s.owner2Share}%)</td><td className="r" style={{ color: s.pnlOwner2 < 0 ? 'var(--red)' : 'var(--green)' }}>{money(s.pnlOwner2)}</td></tr>
            </tbody></table>
            {proj.notes && <div className="hint" style={{ marginTop: 10 }}>📝 {proj.notes}</div>}
          </div>
          <div className="card">
            <h2>Recent activity</h2>
            {activity.length === 0 && <div className="muted">Nothing yet — raise an invoice or record a payment.</div>}
            <div className="activity-list">
              {activity.map((a, i) => (
                <div key={i} className={`activity-row ${a.cancelled ? 'row-cancelled' : ''}`}>
                  <span className="muted tiny nowrap">{d10(a.date)}</span>
                  <span className="activity-text">{a.text}</span>
                  <b style={{ color: a.kind === 'in' ? 'var(--green)' : 'var(--red)' }}>{a.kind === 'in' ? '+' : '−'} {money(a.amount)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ CUSTOMER ══ */}
      {tab === 'customer' && (
        <>
          <div className="bal-strip">
            <span>Invoiced <b>{money(s.invoiced)}</b></span>
            <span>+ Billable exp <b>{money(s.billableExpenses)}</b></span>
            <span>− Received <b>{money(s.customerPaid)}</b></span>
            <span className="bal-final">= Receivable <b style={{ color: s.receivable > 0 ? 'var(--orange-dark)' : 'var(--green)' }}>{money(s.receivable)}</b></span>
          </div>

          <div className="card">
            <div className="card-head-row">
              <h2>Invoices {proj.customerName && <span className="muted h-sub">{proj.customerName}</span>}</h2>
              <button className="mini-btn" onClick={() => navigate(`/invoices/new?project=${proj.id}`)}>+ Raise invoice</button>
            </div>
            {proj.invoices.length === 0
              ? <div className="muted empty-row" style={{ textAlign: 'center' }}>No invoices in this project yet.</div>
              : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>Invoice No</th><th>Date</th><th>Customer</th><th className="r">Total</th><th /></tr></thead>
                    <tbody>
                      {proj.invoices.map((i) => (
                        <tr key={i.id} className={i.status === 'cancelled' ? 'row-cancelled' : ''} onClick={() => navigate(`/invoices/${i.id}`)}>
                          <td><b>{i.invoiceNo}</b>{i.status === 'cancelled' && <span className="badge badge-red">CANCELLED</span>}</td>
                          <td>{d10(i.invoiceDate)}</td>
                          <td>{i.buyerName}</td>
                          <td className="r"><b>{money(i.grandTotal)}</b></td>
                          <td className="r"><span className="mini-btn">view</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>

          <div className="card">
            <div className="card-head-row">
              <h2>Customer payments <span className="muted h-sub">tranches — receivable updates automatically</span></h2>
              {!addType && !editPay && <button className="mini-btn" onClick={() => setAddType('customer-payment')}>+ Record payment</button>}
            </div>
            {formFor('customer-payment', { desc: 'Description', descPh: 'e.g. 2nd tranche against AMZ-0004' })}
            <PayTable rows={pays('customer-payment')} onEdit={startEdit} onDelete={deletePayment} showParty={false} />
          </div>
        </>
      )}

      {/* ══ SUPPLIER ══ */}
      {tab === 'supplier' && (
        <>
          <div className="bal-strip">
            <span>Total payable <b>{money(s.supplierPayable)}</b></span>
            <span>− Paid <b>{money(s.supplierPaid)}</b></span>
            <span className="bal-final">= Balance <b style={{ color: s.supplierBalance > 0 ? 'var(--orange-dark)' : 'var(--green)' }}>{money(s.supplierBalance)}</b></span>
          </div>
          <div className="card">
            <div className="card-head-row">
              <h2>Supplier payments {proj.supplierName && <span className="muted h-sub">{proj.supplierName}</span>}</h2>
              {!addType && !editPay && <button className="mini-btn" onClick={() => setAddType('supplier-payment')}>+ Record payment</button>}
            </div>
            {formFor('supplier-payment', { desc: 'Description', descPh: 'e.g. advance against PO / final settlement' })}
            <PayTable rows={pays('supplier-payment')} onEdit={startEdit} onDelete={deletePayment} showParty={false} />
            <div className="hint" style={{ marginTop: 8 }}>Set the total payable in <b>Edit</b> (top of page); each payment recorded here reduces the balance automatically.</div>
          </div>
        </>
      )}

      {/* ══ EXPENSES ══ */}
      {tab === 'expenses' && (
        <>
          <div className="bal-strip">
            <span>Company-borne <b>{money(s.companyExpenses)}</b></span>
            <span>Customer-billable <b>{money(s.billableExpenses)}</b></span>
          </div>
          <div className="card">
            <div className="card-head-row">
              <h2>Expenses <span className="muted h-sub">company = project cost · customer = added to receivable</span></h2>
              {!addType && !editPay && <button className="mini-btn" onClick={() => setAddType('expense')}>+ Add expense</button>}
            </div>
            {formFor('expense', { desc: 'What was it for', descPh: 'e.g. transport, crane hire, site material' })}
            <PayTable rows={expenses} onEdit={startEdit} onDelete={deletePayment} />
          </div>
        </>
      )}

      {/* ══ CONSULTANT ══ */}
      {tab === 'consultant' && (
        <>
          <div className="bal-strip">
            <span>Consultant payouts <b>{money(s.consultantPaid)}</b></span>
            <span>Invoice referral commissions <b>{money(s.invoiceCommissions)}</b></span>
          </div>
          <div className="card">
            <div className="card-head-row">
              <h2>Consultant / referral payments</h2>
              {!addType && !editPay && <button className="mini-btn" onClick={() => setAddType('consultant')}>+ Record payout</button>}
            </div>
            {formFor('consultant', { desc: 'Description', descPh: 'e.g. referral fee for this project' })}
            <PayTable rows={pays('consultant')} onEdit={startEdit} onDelete={deletePayment} />
          </div>
          {s.invoiceCommissions > 0 && (
            <div className="hint-card">
              This project's invoices also carry <b>{money(s.invoiceCommissions)}</b> of internal referral commissions
              (set on the invoices themselves) — already counted in the P&amp;L above and visible in Accounts → Commissions.
            </div>
          )}
        </>
      )}
    </div>
  );
}
