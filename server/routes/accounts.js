// Accounts — inflow/outflow ledger. Manual entries (expenses, other
// income) are stored in AccountEntry; the ledger merges them with
// invoices (money in) and purchases (money out) so the period's full
// cash flow is visible and exportable as Excel.
import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';

const router = Router();
router.use(authRequired);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const d10 = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

function range(req) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : '1900-01-01';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : '2999-12-31';
  return { from, to };
}

function entryData(body, username) {
  const kind = body.kind === 'in' ? 'in' : 'out';
  const entryType = body.entryType === 'advance' ? 'advance' : 'regular';
  const partyName = String(body.partyName || '').trim();
  if (entryType === 'advance' && !partyName) {
    throw Object.assign(new Error('Advance payments need the party name (who paid / who was paid).'), { status: 400 });
  }
  return {
    entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
    kind,
    entryType,
    partyName,
    category: entryType === 'advance' ? (String(body.category || '').trim() || 'Advance') : (String(body.category || 'General').trim() || 'General'),
    description: String(body.description || ''),
    mode: String(body.mode || 'Cash').trim() || 'Cash',
    refNo: String(body.refNo || '').trim(),
    amount: r2(body.amount),
    ...(username ? { createdBy: username } : {}),
  };
}

// Merge manual entries + invoices (in) + purchases (out) + referral
// commissions (out, derived from invoices) into one ledger.
async function buildLedger(from, to) {
  const dateWhere = { gte: new Date(from), lte: new Date(`${to}T23:59:59`) };
  const [manual, invoices, purchases, projectOutflows, partnerDraws] = await Promise.all([
    prisma.accountEntry.findMany({ where: { entryDate: dateWhere }, orderBy: { entryDate: 'desc' } }),
    prisma.invoice.findMany({
      where: { status: 'active', invoiceDate: dateWhere },
      select: {
        id: true, invoiceNo: true, invoiceDate: true, buyerName: true, invoiceType: true,
        grandTotal: true, subTotal: true,
        commissionEnabled: true, commissionType: true, commissionRate: true, commissionAmount: true,
        agent: { select: { id: true, name: true, pan: true, phone: true } },
      },
    }),
    prisma.purchase.findMany({
      where: { purchaseDate: dateWhere },
      select: { id: true, purchaseDate: true, vendorName: true, billNo: true, totalAmount: true },
    }),
    // Project money-out (supplier payments, expenses, consultant payouts).
    // Customer receipts are intentionally EXCLUDED — the linked invoices
    // already represent that revenue in this ledger.
    prisma.projectPayment.findMany({
      where: { payDate: dateWhere, type: { not: 'customer-payment' } },
      include: { project: { select: { name: true, code: true } } },
    }),
    // Owner drawings — money leaving the business.
    prisma.partnerWithdrawal.findMany({
      where: { payDate: dateWhere },
      include: { project: { select: { name: true, code: true } } },
    }),
  ]);
  const settings = await prisma.companySettings.findUnique({ where: { id: 1 }, select: { owner1Name: true, owner2Name: true } });
  const ownerName = (n) => (n === 1 ? settings?.owner1Name : settings?.owner2Name) || `Owner ${n}`;

  const withCommission = invoices.filter((i) => i.commissionEnabled && i.commissionAmount > 0);

  const rows = [
    ...manual.map((e) => ({
      source: 'manual', sourceId: e.id, date: e.entryDate, kind: e.kind,
      entryType: e.entryType, partyName: e.partyName,
      category: e.category, description: e.description, mode: e.mode, refNo: e.refNo, amount: r2(e.amount),
    })),
    ...invoices.map((i) => ({
      source: 'invoice', sourceId: i.id, date: i.invoiceDate, kind: 'in',
      entryType: '', partyName: i.buyerName,
      category: 'Sales', description: `Invoice ${i.invoiceNo} — ${i.buyerName} (${i.invoiceType})`,
      mode: '', refNo: i.invoiceNo, amount: r2(i.grandTotal),
    })),
    ...purchases.map((p) => ({
      source: 'purchase', sourceId: p.id, date: p.purchaseDate, kind: 'out',
      entryType: '', partyName: p.vendorName,
      category: 'Purchases', description: `Purchase — ${p.vendorName}${p.billNo ? ` (Bill ${p.billNo})` : ''}`,
      mode: '', refNo: p.billNo, amount: r2(p.totalAmount),
    })),
    ...withCommission.map((i) => ({
      source: 'commission', sourceId: i.id, date: i.invoiceDate, kind: 'out',
      entryType: '', partyName: i.agent?.name || '(agent removed)',
      category: 'Commission',
      description: `Referral commission — ${i.agent?.name || '(agent removed)'} on ${i.invoiceNo}${i.commissionType === 'percent' ? ` (${i.commissionRate}% of taxable ₹${i.subTotal})` : ' (fixed)'}`,
      mode: '', refNo: i.invoiceNo, amount: r2(i.commissionAmount),
    })),
    ...projectOutflows.map((p) => ({
      source: 'project', sourceId: p.id, date: p.payDate, kind: 'out',
      entryType: '', partyName: p.partyName,
      category: p.type === 'supplier-payment' ? 'Supplier Payment'
        : p.type === 'consultant' ? 'Consultant'
        : p.chargeTo === 'customer' ? 'Project Expense (billable)' : 'Project Expense',
      description: `${p.description || p.type} — ${p.project?.name || 'project'} (${p.project?.code || ''})`,
      mode: p.mode, refNo: p.refNo, amount: r2(p.amount),
    })),
    ...partnerDraws.map((w) => ({
      source: 'partner', sourceId: w.id, date: w.payDate, kind: 'out',
      entryType: '', partyName: ownerName(w.owner),
      category: 'Owner Drawing',
      description: `Owner drawing — ${ownerName(w.owner)}${w.project ? ` (${w.project.code})` : ''}${w.notes ? ` · ${w.notes}` : ''}`,
      mode: w.mode, refNo: w.refNo, amount: r2(w.amount),
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const sum = (list) => r2(list.reduce((s, x) => s + x.amount, 0));
  const inRows = rows.filter((x) => x.kind === 'in');
  const outRows = rows.filter((x) => x.kind === 'out');

  const byCategory = {};
  for (const x of rows) {
    const c = byCategory[x.category] || { category: x.category, in: 0, out: 0 };
    c[x.kind] = r2(c[x.kind] + x.amount);
    byCategory[x.category] = c;
  }

  const advIn = rows.filter((x) => x.entryType === 'advance' && x.kind === 'in');
  const advOut = rows.filter((x) => x.entryType === 'advance' && x.kind === 'out');

  return {
    from, to, rows,
    totals: {
      inflow: sum(inRows), inCount: inRows.length,
      outflow: sum(outRows), outCount: outRows.length,
      net: r2(sum(inRows) - sum(outRows)),
      advanceIn: sum(advIn), advanceInCount: advIn.length,
      advanceOut: sum(advOut), advanceOutCount: advOut.length,
      commissions: sum(rows.filter((x) => x.source === 'commission')),
      commissionCount: withCommission.length,
    },
    byCategory: Object.values(byCategory).sort((a, b) => (b.in + b.out) - (a.in + a.out)),
  };
}

// Commission detail for a period: per-invoice rows + agent-wise totals.
async function buildCommissions(from, to) {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: 'active',
      commissionEnabled: true,
      commissionAmount: { gt: 0 },
      invoiceDate: { gte: new Date(from), lte: new Date(`${to}T23:59:59`) },
    },
    orderBy: { invoiceDate: 'desc' },
    select: {
      id: true, invoiceNo: true, invoiceDate: true, buyerName: true, subTotal: true, grandTotal: true,
      commissionType: true, commissionRate: true, commissionAmount: true,
      agent: { select: { id: true, name: true, pan: true, phone: true } },
    },
  });
  const rows = invoices.map((i) => ({
    invoiceId: i.id, invoiceNo: i.invoiceNo, date: i.invoiceDate, buyerName: i.buyerName,
    taxable: r2(i.subTotal), invoiceTotal: r2(i.grandTotal),
    basis: i.commissionType === 'percent' ? `${i.commissionRate}% of taxable` : 'Fixed amount',
    amount: r2(i.commissionAmount),
    agentId: i.agent?.id ?? null, agentName: i.agent?.name || '(agent removed)',
    agentPan: i.agent?.pan || '', agentPhone: i.agent?.phone || '',
  }));
  const byAgent = {};
  for (const x of rows) {
    const key = x.agentId ?? 'none';
    const a = byAgent[key] || { agentId: x.agentId, name: x.agentName, pan: x.agentPan, phone: x.agentPhone, count: 0, total: 0 };
    a.count += 1;
    a.total = r2(a.total + x.amount);
    byAgent[key] = a;
  }
  return {
    from, to, rows,
    byAgent: Object.values(byAgent).sort((a, b) => b.total - a.total),
    total: r2(rows.reduce((s, x) => s + x.amount, 0)),
  };
}

// ── Ledger (merged view) ──
router.get('/ledger', async (req, res, next) => {
  try {
    const { from, to } = range(req);
    res.json(await buildLedger(from, to));
  } catch (e) { next(e); }
});

// ── Commissions (per-invoice + agent-wise) ──
router.get('/commissions', async (req, res, next) => {
  try {
    const { from, to } = range(req);
    res.json(await buildCommissions(from, to));
  } catch (e) { next(e); }
});

// ── Manual entries CRUD ──
router.post('/', async (req, res, next) => {
  try {
    const data = entryData(req.body || {}, req.user.username);
    if (!(data.amount > 0)) return res.status(400).json({ error: 'Amount must be greater than zero.' });
    res.json(await prisma.accountEntry.create({ data }));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const data = entryData(req.body || {}, null);
    if (!(data.amount > 0)) return res.status(400).json({ error: 'Amount must be greater than zero.' });
    res.json(await prisma.accountEntry.update({ where: { id: Number(req.params.id) }, data }));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.accountEntry.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Excel export ──
router.get('/ledger.xlsx', async (req, res, next) => {
  try {
    const { from, to } = range(req);
    const ledger = await buildLedger(from, to);
    const wb = new ExcelJS.Workbook();

    const headStyle = (row) => {
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5AA8' } }; });
    };

    const s = wb.addWorksheet('Summary');
    s.columns = [{ width: 36 }, { width: 16 }, { width: 16 }, { width: 16 }];
    s.addRow(['Accounts — Inflow / Outflow Summary']).font = { bold: true, size: 14 };
    s.addRow([`Period: ${from} to ${to}`]);
    s.addRow([]);
    headStyle(s.addRow(['Particulars', 'Count', 'Amount (₹)', '']));
    s.addRow(['Money In (inflow)', ledger.totals.inCount, ledger.totals.inflow, '']);
    s.addRow(['Money Out (outflow)', ledger.totals.outCount, ledger.totals.outflow, '']);
    s.addRow(['Net Cash Flow', '', ledger.totals.net, '']).font = { bold: true };
    s.addRow(['— of which: Advances received', ledger.totals.advanceInCount, ledger.totals.advanceIn, '']);
    s.addRow(['— of which: Advances paid', ledger.totals.advanceOutCount, ledger.totals.advanceOut, '']);
    s.addRow(['— of which: Referral commissions', ledger.totals.commissionCount, ledger.totals.commissions, '']);
    s.addRow([]);
    headStyle(s.addRow(['Category', 'Money In', 'Money Out', 'Net']));
    for (const c of ledger.byCategory) {
      s.addRow([c.category, c.in, c.out, r2(c.in - c.out)]);
    }

    const l = wb.addWorksheet('Ledger');
    l.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Source', key: 'source', width: 11 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Party', key: 'party', width: 22 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Description', key: 'desc', width: 46 },
      { header: 'Mode', key: 'mode', width: 9 },
      { header: 'Ref', key: 'ref', width: 14 },
      { header: 'Money In', key: 'in', width: 13 },
      { header: 'Money Out', key: 'out', width: 13 },
    ];
    headStyle(l.getRow(1));
    for (const x of [...ledger.rows].reverse()) { // oldest first in the sheet
      l.addRow({
        date: d10(x.date), source: x.source, type: x.entryType || '', party: x.partyName || '',
        category: x.category, desc: x.description,
        mode: x.mode, ref: x.refNo,
        in: x.kind === 'in' ? x.amount : '', out: x.kind === 'out' ? x.amount : '',
      });
    }
    const totalRow = l.addRow({ desc: 'TOTAL', in: ledger.totals.inflow, out: ledger.totals.outflow });
    totalRow.font = { bold: true };

    // ── Commissions sheet (internal reference) ──
    const comm = await buildCommissions(from, to);
    const c = wb.addWorksheet('Commissions');
    c.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Invoice No', key: 'no', width: 14 },
      { header: 'Customer', key: 'cust', width: 26 },
      { header: 'Taxable Value', key: 'taxable', width: 15 },
      { header: 'Agent', key: 'agent', width: 22 },
      { header: 'Agent PAN', key: 'pan', width: 14 },
      { header: 'Basis', key: 'basis', width: 18 },
      { header: 'Commission', key: 'amount', width: 14 },
    ];
    headStyle(c.getRow(1));
    for (const x of [...comm.rows].reverse()) {
      c.addRow({
        date: d10(x.date), no: x.invoiceNo, cust: x.buyerName, taxable: x.taxable,
        agent: x.agentName, pan: x.agentPan, basis: x.basis, amount: x.amount,
      });
    }
    c.addRow({ basis: 'TOTAL', amount: comm.total }).font = { bold: true };
    c.addRow({});
    headStyle(c.addRow({ date: 'Agent', no: 'PAN', cust: 'Phone', taxable: 'Invoices', agent: 'Total Commission' }));
    for (const a of comm.byAgent) {
      c.addRow({ date: a.name, no: a.pan, cust: a.phone, taxable: a.count, agent: a.total });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Accounts-${from}-to-${to}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

export default router;
