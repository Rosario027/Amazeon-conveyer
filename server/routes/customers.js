// Customer directory — auto-populated when invoices are saved, searchable
// from the invoice editor for one-click autofill.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { gstin: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        }
      : {};
    const customers = await prisma.customer.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { _count: { select: { invoices: true } } },
    });
    res.json(customers);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        invoices: { orderBy: { invoiceDate: 'desc' }, take: 50, select: { id: true, invoiceNo: true, invoiceDate: true, invoiceType: true, grandTotal: true, status: true } },
      },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    res.json(customer);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.customer.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
