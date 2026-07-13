import { Router } from 'express';
import { authenticate, changePassword, authRequired } from '../lib/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const result = await authenticate(username, password);
    if (!result) return res.status(401).json({ error: 'Invalid username or password.' });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', authRequired, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const result = await changePassword(req.user.username, currentPassword, newPassword);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
