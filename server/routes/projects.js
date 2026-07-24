// Projects — the hub everything hangs off. A project links invoices
// (receivable side), supplier commitment + payments (payable side),
// expenses (company-borne or customer-billable) and consultant/referral
// payouts. All balances and the P&L are computed here, server-side, so
// every view of a project agrees.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';

const router = Router();
router.use(authRequired);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sumAmt = (list) => r2(list.reduce((s, p) => s + (p.amount || 0), 0));

export const PAYMENT_TYPES = ['supplier-payment', 'customer-payment', 'expense', 'consultant'];

// ── The single source of truth for project money math ──
//   receivable      = invoiced + customer-billable expenses − customer receipts
//   supplierBalance = committed payable − supplier payments
//   P&L             = (invoiced + billable exp)
//                     − (supplier cost + company exp + consultant + invoice commissions)
//   supplier cost uses max(committed, actually paid) so an unset/low
//   commitment can never overstate profit.
export function summarize(project, invoices, payments) {
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
    pnl: r2(income - costs),
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

// ── List with computed summaries ──
router.get('/', async (req, res, next) => {
  try {
    const { q, status } = req.query;
    const where = {};
    if (status === 'active' || status === 'completed') where.status = status;
    if (q) {
      where.OR = [
        { name: { contains: String(q), mode: 'insensitive' } },
        { code: { contains: String(q), mode: 'insensitive' } },
        { customerName: { contains: String(q), mode: 'insensitive' } },
        { supplierName: { contains: String(q), mode: 'insensitive' } },
      ];
    }
    const projects = await prisma.project.findMany({
      where,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      include: { invoices: { select: INVOICE_SELECT }, payments: true },
    });
    res.json(projects.map((p) => ({
      id: p.id, code: p.code, name: p.name, status: p.status,
      customerName: p.customerName, supplierName: p.supplierName,
      notes: p.notes, createdAt: p.createdAt,
      summary: summarize(p, p.invoices, p.payments),
    })));
  } catch (e) { next(e); }
});

// ── Create (code PRJ-0001 assigned from the new id) ──
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Project name is required.' });
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name,
          customerName: String(body.customerName || '').trim(),
          supplierName: String(body.supplierName || '').trim(),
          supplierPayable: r2(body.supplierPayable),
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
  } catch (e) { next(e); }
});

// ── Detail: project + linked records + computed summary ──
router.get('/:id', async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        invoices: { select: INVOICE_SELECT, orderBy: { invoiceDate: 'desc' } },
        payments: { include: PAYMENT_INCLUDE, orderBy: [{ payDate: 'desc' }, { id: 'desc' }] },
      },
    });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json({ ...project, summary: summarize(project, project.invoices, project.payments) });
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
    if ('status' in body) data.status = body.status === 'completed' ? 'completed' : 'active';
    const project = await prisma.project.update({ where: { id: Number(req.params.id) }, data });
    res.json(project);
  } catch (e) { next(e); }
});

// ── Delete (blocked while invoices are linked) ──
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const invoiceCount = await prisma.invoice.count({ where: { projectId: id } });
    if (invoiceCount > 0) {
      return res.status(400).json({ error: `This project has ${invoiceCount} invoice(s) linked — cancel or unlink them first.` });
    }
    await prisma.project.delete({ where: { id } });
    res.json({ ok: true });
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
