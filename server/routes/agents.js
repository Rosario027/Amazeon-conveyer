// Commission / referral agents — registered from the Accounts module.
// Name, phone and PAN are mandatory; email / bank account / remarks are
// optional. Agents with commissions on invoices cannot be deleted.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';

const router = Router();
router.use(authRequired);

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function agentData(body) {
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const pan = String(body.pan || '').trim().toUpperCase();
  if (!name) throw Object.assign(new Error('Agent name is required.'), { status: 400 });
  if (!phone) throw Object.assign(new Error('Agent phone number is required.'), { status: 400 });
  if (!pan) throw Object.assign(new Error('Agent PAN number is required.'), { status: 400 });
  if (!PAN_RE.test(pan)) throw Object.assign(new Error('PAN must be 10 characters like ABCDE1234F.'), { status: 400 });
  return {
    name,
    phone,
    pan,
    email: String(body.email || '').trim(),
    bankAccount: String(body.bankAccount || '').trim(),
    remarks: String(body.remarks || ''),
  };
}

router.get('/', async (_req, res, next) => {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { invoices: { where: { commissionEnabled: true } } } } },
    });
    res.json(agents);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = agentData(req.body || {});
    const dup = await prisma.agent.findFirst({ where: { pan: data.pan } });
    if (dup) return res.status(400).json({ error: `An agent with PAN ${data.pan} already exists (${dup.name}).` });
    res.json(await prisma.agent.create({ data }));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = agentData(req.body || {});
    const dup = await prisma.agent.findFirst({ where: { pan: data.pan, NOT: { id } } });
    if (dup) return res.status(400).json({ error: `An agent with PAN ${data.pan} already exists (${dup.name}).` });
    res.json(await prisma.agent.update({ where: { id }, data }));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const used = await prisma.invoice.count({ where: { agentId: id, commissionEnabled: true } });
    if (used > 0) return res.status(400).json({ error: `This agent has commissions on ${used} invoice(s) — remove those first.` });
    await prisma.agent.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
