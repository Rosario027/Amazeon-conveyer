// Invoices: B2B / B2C GST tax invoices. Totals are always recomputed
// server-side (lib/calc.js); the tax mode (intra → CGST+SGST vs
// inter → IGST) is derived from the buyer's state code vs the company's.
// Deleting an invoice CANCELS it (GST numbering must stay continuous) —
// cancelled documents keep their number and show in reports as cancelled.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';
import { computeTotals } from '../lib/calc.js';
import { generateInvoicePdf } from '../lib/pdf.js';

const router = Router();
router.use(authRequired);

function deriveTaxMode(buyerStateCode, companyStateCode) {
  const b = String(buyerStateCode || '').trim();
  const c = String(companyStateCode || '').trim();
  if (!b || !c) return 'intra'; // no state info → treat as local supply
  return b === c ? 'intra' : 'inter';
}

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((it) => String(it.description || '').trim() !== '')
    .map((it, idx) => ({
      slNo: idx + 1,
      description: String(it.description || '').trim(),
      hsnCode: String(it.hsnCode || '').trim(),
      partNo: String(it.partNo || '').trim(),
      qty: Number(it.qty) || 0,
      unit: String(it.unit || 'Nos').trim(),
      rate: Number(it.rate) || 0,
      gstRate: Number(it.gstRate) || 0,
    }));
}

function buyerFields(body, settings) {
  const invoiceType = body.invoiceType === 'B2C' ? 'B2C' : 'B2B';
  const buyerStateCode = String(body.buyerStateCode || '').trim();
  const buyerStateName = String(body.buyerStateName || '').trim();
  const taxMode = deriveTaxMode(buyerStateCode, settings.stateCode);
  return {
    invoiceType,
    buyerName: String(body.buyerName || '').trim(),
    buyerGstin: invoiceType === 'B2B' ? String(body.buyerGstin || '').trim().toUpperCase() : '',
    buyerEmail: String(body.buyerEmail || '').trim(),
    buyerPhone: String(body.buyerPhone || '').trim(),
    billTo: String(body.billTo || ''),
    shipTo: String(body.shipTo || ''),
    buyerStateName,
    buyerStateCode,
    placeOfSupply: buyerStateName ? `${buyerStateName} (${buyerStateCode || '-'})` : `${settings.stateName} (${settings.stateCode})`,
    taxMode,
    reverseCharge: !!body.reverseCharge,
    poRefNo: String(body.poRefNo || '').trim(),
    paymentTerms: String(body.paymentTerms || '').trim(),
    notes: String(body.notes || ''),
  };
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Referral commission — INTERNAL ONLY (never printed on the invoice).
// percent → rate % of the taxable value; amount → fixed amount.
// Resolved commissionAmount is stored for the accounts ledger.
async function commissionFields(tx, body, subTotal) {
  if (!body.commissionEnabled) {
    return { commissionEnabled: false, agentId: null, commissionType: 'percent', commissionRate: 0, commissionAmount: 0 };
  }
  const agentId = Number(body.agentId) || 0;
  const agent = agentId ? await tx.agent.findUnique({ where: { id: agentId } }) : null;
  if (!agent) throw Object.assign(new Error('Select a registered agent for the referral commission (register agents in Accounts → Agents).'), { status: 400 });
  const type = body.commissionType === 'amount' ? 'amount' : 'percent';
  let rate = 0, amount = 0;
  if (type === 'percent') {
    rate = Number(body.commissionRate) || 0;
    if (rate <= 0 || rate > 100) throw Object.assign(new Error('Commission percentage must be between 0 and 100.'), { status: 400 });
    amount = r2((subTotal * rate) / 100);
  } else {
    amount = r2(body.commissionAmount);
    if (amount <= 0) throw Object.assign(new Error('Commission amount must be greater than zero.'), { status: 400 });
  }
  return { commissionEnabled: true, agentId: agent.id, commissionType: type, commissionRate: rate, commissionAmount: amount };
}

// Find-or-create the customer record so future invoices can autofill.
async function resolveCustomerId(tx, fields) {
  if (!fields.buyerName) return null;
  let customer = null;
  if (fields.buyerGstin) {
    customer = await tx.customer.findFirst({ where: { gstin: { equals: fields.buyerGstin, mode: 'insensitive' } } });
  }
  if (!customer) {
    customer = await tx.customer.findFirst({ where: { name: { equals: fields.buyerName, mode: 'insensitive' } } });
  }
  const data = {
    kind: fields.invoiceType,
    name: fields.buyerName,
    gstin: fields.buyerGstin,
    email: fields.buyerEmail,
    phone: fields.buyerPhone,
    billTo: fields.billTo,
    shipTo: fields.shipTo,
    stateName: fields.buyerStateName,
    stateCode: fields.buyerStateCode,
  };
  if (customer) {
    await tx.customer.update({ where: { id: customer.id }, data });
    return customer.id;
  }
  const created = await tx.customer.create({ data });
  return created.id;
}

// ── List (filters: q, type, status, from, to) ──
router.get('/', async (req, res, next) => {
  try {
    const { q, type, status, from, to } = req.query;
    const where = {};
    if (type === 'B2B' || type === 'B2C') where.invoiceType = type;
    if (status === 'active' || status === 'cancelled') where.status = status;
    if (/^\d{4}-\d{2}-\d{2}$/.test(from || '') || /^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
      where.invoiceDate = {};
      if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) where.invoiceDate.gte = new Date(from);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to || '')) where.invoiceDate.lte = new Date(`${to}T23:59:59`);
    }
    if (q) {
      where.OR = [
        { invoiceNo: { contains: String(q), mode: 'insensitive' } },
        { buyerName: { contains: String(q), mode: 'insensitive' } },
        { buyerGstin: { contains: String(q), mode: 'insensitive' } },
      ];
    }
    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
      take: 300,
      select: {
        id: true, invoiceNo: true, invoiceDate: true, invoiceType: true, status: true,
        buyerName: true, buyerGstin: true, taxMode: true,
        subTotal: true, cgstAmount: true, sgstAmount: true, igstAmount: true, grandTotal: true,
      },
    });
    res.json(invoices);
  } catch (e) { next(e); }
});

// ── Next invoice number preview ──
router.get('/next-number', async (_req, res, next) => {
  try {
    const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });
    res.json({ invoiceNo: `${settings.invoicePrefix}${String(settings.nextInvoiceSeq).padStart(4, '0')}` });
  } catch (e) { next(e); }
});

// ── Create ──
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });
    const fields = buyerFields(body, settings);
    if (!fields.buyerName) return res.status(400).json({ error: 'Customer name is required.' });
    if (fields.invoiceType === 'B2B' && !fields.buyerGstin) {
      return res.status(400).json({ error: 'A B2B invoice needs the recipient GSTIN — or switch to B2C.' });
    }
    const items = cleanItems(body.items);
    if (!items.length) return res.status(400).json({ error: 'Add at least one line item.' });

    const totals = computeTotals({ items, taxMode: fields.taxMode });
    const invoiceDate = body.invoiceDate ? new Date(body.invoiceDate) : new Date();

    const created = await prisma.$transaction(async (tx) => {
      const fresh = await tx.companySettings.findUnique({ where: { id: 1 } });
      let invoiceNo = String(body.invoiceNo || '').trim();
      let usedSeq = null;
      if (!invoiceNo) {
        // auto-number: find the first free sequence from settings
        let seq = fresh.nextInvoiceSeq;
        for (let i = 0; i < 200; i++) {
          const candidate = `${fresh.invoicePrefix}${String(seq).padStart(4, '0')}`;
          const clash = await tx.invoice.findUnique({ where: { invoiceNo: candidate } });
          if (!clash) { invoiceNo = candidate; usedSeq = seq; break; }
          seq += 1;
        }
        if (!invoiceNo) throw Object.assign(new Error('Could not allocate an invoice number.'), { status: 500 });
      } else {
        const clash = await tx.invoice.findUnique({ where: { invoiceNo } });
        if (clash) throw Object.assign(new Error(`Invoice number ${invoiceNo} already exists.`), { status: 400 });
      }

      const customerId = await resolveCustomerId(tx, fields);
      const commission = await commissionFields(tx, body, totals.subTotal);
      const invoice = await tx.invoice.create({
        data: {
          invoiceNo,
          invoiceDate,
          ...fields,
          ...commission,
          customerId,
          subTotal: totals.subTotal,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          roundOff: totals.roundOff,
          grandTotal: totals.grandTotal,
          createdBy: req.user.username,
          items: { create: totals.items.map(({ slNo, description, hsnCode, partNo, qty, unit, rate, gstRate, taxable }) => ({ slNo, description, hsnCode, partNo, qty, unit, rate, gstRate, taxable })) },
        },
        include: { items: true },
      });

      if (usedSeq !== null) {
        await tx.companySettings.update({ where: { id: 1 }, data: { nextInvoiceSeq: usedSeq + 1 } });
      }
      return invoice;
    });

    res.json(created);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// ── Read ──
router.get('/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        items: { orderBy: { slNo: 'asc' } },
        agent: { select: { id: true, name: true, pan: true } },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    res.json(invoice);
  } catch (e) { next(e); }
});

// ── Update (replaces line items, recomputes totals) ──
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found.' });
    if (existing.status === 'cancelled') return res.status(400).json({ error: 'Cancelled invoices cannot be edited.' });

    const body = req.body || {};
    const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });
    const fields = buyerFields(body, settings);
    if (!fields.buyerName) return res.status(400).json({ error: 'Customer name is required.' });
    if (fields.invoiceType === 'B2B' && !fields.buyerGstin) {
      return res.status(400).json({ error: 'A B2B invoice needs the recipient GSTIN — or switch to B2C.' });
    }
    const items = cleanItems(body.items);
    if (!items.length) return res.status(400).json({ error: 'Add at least one line item.' });

    const totals = computeTotals({ items, taxMode: fields.taxMode });
    let invoiceNo = String(body.invoiceNo || '').trim() || existing.invoiceNo;

    const updated = await prisma.$transaction(async (tx) => {
      if (invoiceNo !== existing.invoiceNo) {
        const clash = await tx.invoice.findUnique({ where: { invoiceNo } });
        if (clash) throw Object.assign(new Error(`Invoice number ${invoiceNo} already exists.`), { status: 400 });
      }
      const customerId = await resolveCustomerId(tx, fields);
      const commission = await commissionFields(tx, body, totals.subTotal);
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      return tx.invoice.update({
        where: { id },
        data: {
          invoiceNo,
          invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : existing.invoiceDate,
          ...fields,
          ...commission,
          customerId,
          subTotal: totals.subTotal,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          roundOff: totals.roundOff,
          grandTotal: totals.grandTotal,
          items: { create: totals.items.map(({ slNo, description, hsnCode, partNo, qty, unit, rate, gstRate, taxable }) => ({ slNo, description, hsnCode, partNo, qty, unit, rate, gstRate, taxable })) },
        },
        include: { items: true },
      });
    });

    res.json(updated);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// ── Cancel (GST-safe delete) ──
router.delete('/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.update({
      where: { id: Number(req.params.id) },
      data: { status: 'cancelled' },
    });
    res.json({ ok: true, invoice });
  } catch (e) { next(e); }
});

// ── PDF ──
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: Number(req.params.id) },
      include: { items: { orderBy: { slNo: 'asc' } } },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });
    const pdf = await generateInvoicePdf(invoice, settings);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNo.replace(/[^\w.-]+/g, '_')}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
});

export default router;
