// Admin configuration: manage login accounts.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { adminRequired, hashPassword } from '../lib/auth.js';

const router = Router();
router.use(adminRequired);

router.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
    res.json(users);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { username, password, role } = req.body || {};
    const name = String(username || '').trim();
    if (!name) return res.status(400).json({ error: 'Username is required.' });
    if (!password || String(password).length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    const existing = await prisma.user.findUnique({ where: { username: name } });
    if (existing) return res.status(400).json({ error: 'That username already exists.' });
    const user = await prisma.user.create({
      data: { username: name, passHash: hashPassword(password), role: role === 'user' ? 'user' : 'admin' },
      select: { id: true, username: true, role: true, createdAt: true },
    });
    res.json(user);
  } catch (e) { next(e); }
});

router.put('/:id/reset-password', async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password || String(password).length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    await prisma.user.update({ where: { id: Number(req.params.id) }, data: { passHash: hashPassword(password) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.username === req.user.username) return res.status(400).json({ error: 'You cannot delete your own account.' });
    const admins = await prisma.user.count({ where: { role: 'admin' } });
    if (target.role === 'admin' && admins <= 1) return res.status(400).json({ error: 'At least one admin account must remain.' });
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
