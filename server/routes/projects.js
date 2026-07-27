// Projects — the hub everything hangs off. A project links invoices
// (receivable side), supplier commitment + payments (payable side),
// expenses (company-borne or customer-billable) and consultant/referral
// payouts. All balances and the P&L are computed here, server-side, so
// every view of a project agrees.
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
const sumAmt = (list) => r2(list.reduce((s, p) => s + (p.amount || 0), 0));

export const PAYMENT_TYPES = ['supplier-payment', 'customer-payment', 'expense', 'consultant'];

// Workflow stages, in order. A project at 'completed' is closed: it greys
// out at the bottom of the list and its profit becomes withdrawable.
export const STAGES = [
  { key: 'created', label: 'Project created' },
  { key: 'quote-given', label: 'Quote given' },
  { key: 'order-placed', label: 'Order placed' },
  { key: 'advance-received', label: 'Advance received' },
  { key: 'in-progress', label: 'Work in progress' },
  { key: 'delivered', label: 'Delivered / installed' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'payment-received', label: 'Payment received' },
  { key: 'completed', label: 'Completed (closed)' },
];
export const STAGE_KEYS = STAGES.map((s) => s.key);
export const isClosed = (p) => p.stage === 'completed' || p.status === 'completed';

// ── The single source of truth for project money math ──
//   receivable      = invoiced + customer-billable expenses − customer receipts
//   supplierBalance = committed payable − supplier payments
//   P&L             = (invoiced + billable exp)
//                     − (supplier cost + company exp + consultant + invoice commissions)
//   supplier cost uses max(committed, actually paid) so an unset/low
//   commitment can never overstate profit.
export function summarize(project, invoices, payments, reservePercent = 0) {
  const activeInv = invoices.filter((i) => i.status === 'active');
  const invoiced = r2(activeInv.reduce((s, i) => s + (i.grandTotal || 0), 0));
  const invoiceCommissions = r2(activeInv.reduce((s, i) => s + (i.commissionEnabled ? i.commissionAmount || 0 : 0), 0));

  const customerPaid = sumAmt(payments.filter((p) => p.type === 'customer-payment'));
  const supplierPaid = sumAmt(payments.filter((p) => p.type === 'supplier-payment'));
  const billableExpenses = sumAmt(payments.filter((p) => p.type === 'expense' && p.chargeTo === 'customer'));
  const companyExpenses = sumAmt(payments.filter((p) => p.type === 'expense' && p.chargeTo === 'company'));
  const consultantPaid = sumAmt(payments.filter((p) => p.type === 'consultant'));

  const supplierPayable = r2(project.supplierPayable || 0);
  const supplierCost = Math.max(supplierPayable, supplierPaid);
  const income = r2(invoiced + billableExpenses);
  const costs = r2(supplierCost + companyExpenses + consultantPaid + invoiceCommissions);
  const pnl = r2(income - costs);

  // Reserve & surplus — a slice of PROFIT is retained by the company
  // before the owners split anything. Losses are never "reserved"; they
  // divide in full.
  const resPct = r2(reservePercent || 0);
  const reserve = pnl > 0 ? r2((pnl * resPct) / 100) : 0;
  const distributable = r2(pnl - reserve);

  // Owner split — profits AND losses divide by the project's share %.
  const owner1Share = r2(project.owner1Share ?? 50);
  const owner2Share = r2(100 - owner1Share);
  const pnlOwner1 = r2((distributable * owner1Share) / 100);
  const pnlOwner2 = r2(distributable - pnlOwner1); // remainder — the two always sum to distributable

  return {
    invoiced,
    invoiceCount: activeInv.length,
    customerPaid,
    billableExpenses,
    companyExpenses,
    receivable: r2(invoiced + billableExpenses - customerPaid),
    supplierPayable,
    supplierPaid,
    supplierBalance: r2(supplierPayable - supplierPaid),
    consultantPaid,
    invoiceCommissions,
    income,
    costs,
    pnl,
    reservePercent: resPct,
    reserve,
    distributable,
    owner1Share,
    owner2Share,
    pnlOwner1,
    pnlOwner2,
    closed: isClosed(project),
    cashIn: customerPaid,
    cashOut: r2(supplierPaid + billableExpenses + companyExpenses + consultantPaid),
    netCash: r2(customerPaid - supplierPaid - billableExpenses - companyExpenses - consultantPaid),
  };
}

function paymentData(body, username) {
  const type = String(body.type || '');
  if (!PAYMENT_TYPES.includes(type)) {
    throw Object.assign(new Error('Invalid payment type.'), { status: 400 });
  }
  const amount = r2(body.amount);
  if (!(amount > 0)) throw Object.assign(new Error('Amount must be greater than zero.'), { status: 400 });
  let chargeTo = '';
  if (type === 'expense') {
    chargeTo = body.chargeTo === 'customer' ? 'customer' : body.chargeTo === 'company' ? 'company' : '';
    if (!chargeTo) throw Object.assign(new Error('Choose who bears the expense — Company or Customer (billable).'), { status: 400 });
  }
  return {
    type,
    chargeTo,
    payDate: body.payDate ? new Date(body.payDate) : new Date(),
    amount,
    mode: String(body.mode || 'Bank').trim() || 'Bank',
    refNo: String(body.refNo || '').trim(),
    description: String(body.description || ''),
    partyName: String(body.partyName || '').trim(),
    agentId: body.agentId ? Number(body.agentId) : null,
    ...(username ? { createdBy: username } : {}),
  };
}

const PAYMENT_INCLUDE = { agent: { select: { id: true, name: true, pan: true } } };
const INVOICE_SELECT = {
  id: true, invoiceNo: true, invoiceDate: true, invoiceType: true, status: true,
  buyerName: true, grandTotal: true, subTotal: true,
  commissionEnabled: true, commissionAmount: true,
};

// ── Cross-project payments feed (sidebar "Payments" module) ──
// Registered BEFORE /:id so the path doesn't get captured as an id.
router.get('/payments-feed', async (req, res, next) => {
  try {
    const { from, to, type, projectId, q } = req.query;
    const where = {};
    if (PAYMENT_TYPES.includes(type)) where.type = type;
    if (Number(projectId)) where.projectId = Number(projectId);
    if (/^\d{4}-\d{2}-\d{2}$/.test(from || '') || /^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
      where.payDate = {};
      if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) where.payDate.gte = new Date(from);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to || '')) where.payDate.lte = new Date(`${to}T23:59:59`);
    }
    if (q) {
      where.OR = [
        { partyName: { contains: String(q), mode: 'insensitive' } },
        { description: { contains: String(q), mode: 'insensitive' } },
        { refNo: { contains: String(q), mode: 'insensitive' } },
      ];
    }
    const payments = await prisma.projectPayment.findMany({
      where,
      orderBy: [{ payDate: 'desc' }, { id: 'desc' }],
      take: 400,
      include: { ...PAYMENT_INCLUDE, project: { select: { id: true, name: true, code: true } } },
    });
    res.json(payments);
  } catch (e) { next(e); }
});

export async function reservePct() {
  const s = await prisma.companySettings.findUnique({ where: { id: 1 }, select: { reservePercent: true } });
  return s?.reservePercent || 0;
}

const listRow = (p, pct) => ({
  id: p.id, code: p.code, name: p.name, status: p.status, stage: p.stage,
  customerName: p.customerName, supplierName: p.supplierName,
  notes: p.notes, createdAt: p.createdAt,
  deletedAt: p.deletedAt, deletedReason: p.deletedReason, deletedBy: p.deletedBy,
  summary: summarize(p, p.invoices, p.payments, pct),
});

// ── List with computed summaries ──
// Ordering mirrors the dashboard: live projects first (newest activity on
// top), then closed ones, then deleted — both greyed at the bottom.
router.get('/', async (req, res, next) => {
  try {
    const { q, status, stage, include } = req.query;
    const where = {};
    if (include !== 'deleted' && include !== 'all') where.deletedAt = null;
    if (include === 'deleted') where.NOT = { deletedAt: null };
    if (status === 'active' || status === 'completed') where.status = status;
    if (STAGE_KEYS.includes(stage)) where.stage = stage;
    if (q) {
      where.OR = [
        { name: { contains: String(q), mode: 'insensitive' } },
        { code: { contains: String(q), mode: 'insensitive' } },
        { customerName: { contains: String(q), mode: 'insensitive' } },
        { supplierName: { contains: String(q), mode: 'insensitive' } },
      ];
    }
    const [projects, pct] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        include: { invoices: { select: INVOICE_SELECT }, payments: true },
      }),
      reservePct(),
    ]);
    const rank = (p) => (p.deletedAt ? 2 : isClosed(p) ? 1 : 0);
    const rows = projects
      .map((p) => ({ p, r: rank(p) }))
      .sort((a, b) => a.r - b.r || new Date(b.p.updatedAt) - new Date(a.p.updatedAt))
      .map(({ p }) => listRow(p, pct));
    res.json(rows);
  } catch (e) { next(e); }
});

// ── Excel export of every project (including closed + deleted) ──
router.get('/export.xlsx', async (_req, res, next) => {
  try {
    const [projects, pct, settings] = await Promise.all([
      prisma.project.findMany({
        orderBy: [{ id: 'asc' }],
        include: { invoices: { select: INVOICE_SELECT }, payments: true },
      }),
      reservePct(),
      prisma.companySettings.findUnique({ where: { id: 1 } }),
    ]);
    const o1 = settings?.owner1Name || 'Owner 1';
    const o2 = settings?.owner2Name || 'Owner 2';
    const wb = new ExcelJS.Workbook();
    const headStyle = (row) => {
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5AA8' } }; });
    };
    const ws = wb.addWorksheet('Projects');
    ws.columns = [
      { header: 'Code', key: 'code', width: 12 }, { header: 'Project', key: 'name', width: 30 },
      { header: 'Customer', key: 'cust', width: 22 }, { header: 'Supplier', key: 'sup', width: 20 },
      { header: 'Stage', key: 'stage', width: 18 }, { header: 'State', key: 'state', width: 12 },
      { header: 'Invoiced', key: 'inv', width: 14 }, { header: 'Received', key: 'rec', width: 14 },
      { header: 'Receivable', key: 'due', width: 14 },
      { header: 'Supplier payable', key: 'sp', width: 16 }, { header: 'Supplier paid', key: 'spd', width: 14 },
      { header: 'Supplier balance', key: 'sb', width: 16 },
      { header: 'Expenses (company)', key: 'ec', width: 18 }, { header: 'Expenses (billable)', key: 'eb', width: 18 },
      { header: 'Consultant', key: 'con', width: 13 },
      { header: 'Income', key: 'income', width: 14 }, { header: 'Costs', key: 'costs', width: 14 },
      { header: 'P&L', key: 'pnl', width: 14 },
      { header: 'Reserve', key: 'res', width: 13 }, { header: 'Distributable', key: 'dist', width: 14 },
      { header: 'Split', key: 'split', width: 10 },
      { header: `${o1} share`, key: 'o1', width: 14 }, { header: `${o2} share`, key: 'o2', width: 14 },
      { header: 'Deleted reason', key: 'delr', width: 28 },
    ];
    headStyle(ws.getRow(1));
    for (const p of projects) {
      const s = summarize(p, p.invoices, p.payments, pct);
      ws.addRow({
        code: p.code, name: p.name, cust: p.customerName, sup: p.supplierName,
        stage: (STAGES.find((x) => x.key === p.stage) || {}).label || p.stage,
        state: p.deletedAt ? 'DELETED' : s.closed ? 'Closed' : 'Active',
        inv: s.invoiced, rec: s.customerPaid, due: s.receivable,
        sp: s.supplierPayable, spd: s.supplierPaid, sb: s.supplierBalance,
        ec: s.companyExpenses, eb: s.billableExpenses, con: s.consultantPaid,
        income: s.income, costs: s.costs, pnl: s.pnl,
        res: s.reserve, dist: s.distributable,
        split: `${s.owner1Share}/${s.owner2Share}`, o1: s.pnlOwner1, o2: s.pnlOwner2,
        delr: p.deletedReason || '',
      });
    }

    // Per-project payment detail
    const pay = wb.addWorksheet('Payments');
    pay.columns = [
      { header: 'Project', key: 'proj', width: 28 }, { header: 'Date', key: 'date', width: 12 },
      { header: 'Type', key: 'type', width: 18 }, { header: 'Charge to', key: 'charge', width: 12 },
      { header: 'Party', key: 'party', width: 22 }, { header: 'Description', key: 'desc', width: 36 },
      { header: 'Mode', key: 'mode', width: 10 }, { header: 'Ref', key: 'ref', width: 14 },
      { header: 'Amount', key: 'amt', width: 14 },
    ];
    headStyle(pay.getRow(1));
    for (const p of projects) {
      for (const x of [...p.payments].sort((a, b) => new Date(a.payDate) - new Date(b.payDate))) {
        pay.addRow({
          proj: `${p.code} — ${p.name}`, date: d10(x.payDate), type: x.type, charge: x.chargeTo,
          party: x.partyName, desc: x.description, mode: x.mode, ref: x.refNo, amt: r2(x.amount),
        });
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Projects.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

// ── Stage catalogue (for the client's stage picker) ──
router.get('/stages', (_req, res) => res.json(STAGES));

// ── Create (code PRJ-0001 assigned from the new id) ──
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Project name is required.' });
    const project = await prisma.$transaction(async (tx) => {
      const share = body.owner1Share === undefined || body.owner1Share === '' ? 50 : r2(body.owner1Share);
      if (share < 0 || share > 100) throw Object.assign(new Error('Owner share must be between 0 and 100%.'), { status: 400 });
      const created = await tx.project.create({
        data: {
          name,
          customerName: String(body.customerName || '').trim(),
          supplierName: String(body.supplierName || '').trim(),
          supplierPayable: r2(body.supplierPayable),
          owner1Share: share,
          notes: String(body.notes || ''),
          createdBy: req.user.username,
        },
      });
      return tx.project.update({
        where: { id: created.id },
        data: { code: `PRJ-${String(created.id).padStart(4, '0')}` },
      });
    });
    res.json(project);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// ── Detail: project + linked records + computed summary ──
router.get('/:id', async (req, res, next) => {
  try {
    const [project, pct] = await Promise.all([
      prisma.project.findUnique({
        where: { id: Number(req.params.id) },
        include: {
          invoices: { select: INVOICE_SELECT, orderBy: { invoiceDate: 'desc' } },
          payments: { include: PAYMENT_INCLUDE, orderBy: [{ payDate: 'desc' }, { id: 'desc' }] },
          stageLogs: { orderBy: { createdAt: 'desc' } },
          withdrawals: { orderBy: [{ payDate: 'desc' }, { id: 'desc' }] },
        },
      }),
      reservePct(),
    ]);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json({ ...project, summary: summarize(project, project.invoices, project.payments, pct) });
  } catch (e) { next(e); }
});

// ── Update project fields / status ──
router.put('/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
    const data = {};
    if ('name' in body) {
      const name = String(body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Project name cannot be empty.' });
      data.name = name;
    }
    for (const f of ['customerName', 'supplierName', 'notes']) if (f in body) data[f] = String(body[f] || '');
    if ('supplierPayable' in body) data.supplierPayable = r2(body.supplierPayable);
    if ('owner1Share' in body) {
      const share = r2(body.owner1Share);
      if (share < 0 || share > 100) return res.status(400).json({ error: 'Owner share must be between 0 and 100%.' });
      data.owner1Share = share;
    }
    if ('status' in body) data.status = body.status === 'completed' ? 'completed' : 'active';
    const project = await prisma.project.update({ where: { id: Number(req.params.id) }, data });
    res.json(project);
  } catch (e) { next(e); }
});

// ── Move to a stage (logged) ──
router.post('/:id/stage', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { stage, note } = req.body || {};
    if (!STAGE_KEYS.includes(stage)) return res.status(400).json({ error: 'Unknown project stage.' });
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (project.deletedAt) return res.status(400).json({ error: 'Restore the project before changing its stage.' });
    if (project.stage === stage) return res.status(400).json({ error: 'The project is already at that stage.' });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.projectStageLog.create({
        data: { projectId: id, fromStage: project.stage, toStage: stage, note: String(note || ''), byUsername: req.user.username },
      });
      // 'completed' closes the project — status mirrors it so existing
      // filters and the withdrawal rules agree.
      return tx.project.update({
        where: { id },
        data: { stage, status: stage === 'completed' ? 'completed' : 'active' },
      });
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// ── Soft delete (reason required) — greys out, never disappears ──
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const reason = String((req.body || {}).reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Please give a reason for deleting this project.' });
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (project.deletedAt) return res.status(400).json({ error: 'This project is already deleted.' });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.projectStageLog.create({
        data: { projectId: id, fromStage: project.stage, toStage: 'deleted', note: reason, byUsername: req.user.username },
      });
      return tx.project.update({
        where: { id },
        data: { deletedAt: new Date(), deletedReason: reason, deletedBy: req.user.username },
      });
    });
    res.json({ ok: true, project: updated });
  } catch (e) { next(e); }
});

// ── Restore a deleted project ──
router.post('/:id/restore', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (!project.deletedAt) return res.status(400).json({ error: 'This project is not deleted.' });
    const updated = await prisma.$transaction(async (tx) => {
      await tx.projectStageLog.create({
        data: { projectId: id, fromStage: 'deleted', toStage: project.stage, note: 'Project restored', byUsername: req.user.username },
      });
      return tx.project.update({ where: { id }, data: { deletedAt: null, deletedReason: '', deletedBy: '' } });
    });
    res.json({ ok: true, project: updated });
  } catch (e) { next(e); }
});

// ── Record a payment / expense / consultant payout ──
router.post('/:id/payments', async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const data = paymentData(req.body || {}, req.user.username);
    if (data.agentId) {
      const agent = await prisma.agent.findUnique({ where: { id: data.agentId } });
      if (!agent) return res.status(400).json({ error: 'Selected agent no longer exists.' });
      if (!data.partyName) data.partyName = agent.name;
    }
    const payment = await prisma.projectPayment.create({
      data: { ...data, projectId },
      include: PAYMENT_INCLUDE,
    });
    res.json(payment);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.put('/:id/payments/:pid', async (req, res, next) => {
  try {
    const data = paymentData(req.body || {}, null);
    const updated = await prisma.projectPayment.updateMany({
      where: { id: Number(req.params.pid), projectId: Number(req.params.id) },
      data,
    });
    if (!updated.count) return res.status(404).json({ error: 'Payment not found.' });
    res.json(await prisma.projectPayment.findUnique({ where: { id: Number(req.params.pid) }, include: PAYMENT_INCLUDE }));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.delete('/:id/payments/:pid', async (req, res, next) => {
  try {
    const deleted = await prisma.projectPayment.deleteMany({
      where: { id: Number(req.params.pid), projectId: Number(req.params.id) },
    });
    if (!deleted.count) return res.status(404).json({ error: 'Payment not found.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
