// Dashboard KPIs — current-month sales, GST position and recent activity.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';

const router = Router();
router.use(authRequired);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [invoices, purchases, recent, activeProjects] = await Promise.all([
      prisma.invoice.findMany({
        where: { status: 'active', invoiceDate: { gte: monthStart, lte: monthEnd } },
        select: { invoiceType: true, subTotal: true, cgstAmount: true, sgstAmount: true, igstAmount: true, grandTotal: true },
      }),
      prisma.purchase.aggregate({
        where: { purchaseDate: { gte: monthStart, lte: monthEnd } },
        _count: true,
        _sum: { totalAmount: true, cgst: true, sgst: true, igst: true },
      }),
      prisma.invoice.findMany({
        orderBy: [{ createdAt: 'desc' }],
        take: 8,
        select: { id: true, invoiceNo: true, invoiceDate: true, invoiceType: true, buyerName: true, grandTotal: true, status: true },
      }),
      // Project receivables (all-time, active projects): invoiced + billable
      // expenses − customer receipts.
      prisma.project.findMany({
        // Deleted projects must never inflate the receivable.
        where: { status: 'active', deletedAt: null },
        include: {
          invoices: { where: { status: 'active' }, select: { grandTotal: true } },
          payments: { where: { type: { in: ['customer-payment', 'expense'] } }, select: { type: true, chargeTo: true, amount: true } },
        },
      }),
    ]);

    const sum = (f) => r2(invoices.reduce((s, i) => s + (f(i) || 0), 0));
    const b2b = invoices.filter((i) => i.invoiceType === 'B2B');
    const b2c = invoices.filter((i) => i.invoiceType === 'B2C');
    const outputTax = sum((i) => i.cgstAmount + i.sgstAmount + i.igstAmount);
    const inputTax = r2((purchases._sum.cgst || 0) + (purchases._sum.sgst || 0) + (purchases._sum.igst || 0));

    const projectReceivable = r2(activeProjects.reduce((s, p) => {
      const invoiced = p.invoices.reduce((a, i) => a + (i.grandTotal || 0), 0);
      const paid = p.payments.filter((x) => x.type === 'customer-payment').reduce((a, x) => a + (x.amount || 0), 0);
      const billable = p.payments.filter((x) => x.type === 'expense' && x.chargeTo === 'customer').reduce((a, x) => a + (x.amount || 0), 0);
      return s + invoiced + billable - paid;
    }, 0));

    res.json({
      month: now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
      sales: { count: invoices.length, total: sum((i) => i.grandTotal), taxable: sum((i) => i.subTotal) },
      b2b: { count: b2b.length, total: r2(b2b.reduce((s, i) => s + i.grandTotal, 0)) },
      b2c: { count: b2c.length, total: r2(b2c.reduce((s, i) => s + i.grandTotal, 0)) },
      gst: { output: outputTax, input: inputTax, net: r2(outputTax - inputTax) },
      purchases: { count: purchases._count || 0, total: r2(purchases._sum.totalAmount || 0) },
      projects: { active: activeProjects.length, receivable: projectReceivable },
      recent,
    });
  } catch (e) { next(e); }
});

export default router;
