// Zero-dependency auth: scrypt-hashed passwords in the DB + HMAC-signed
// bearer tokens. Two owner accounts are seeded (admin1 / admin2) and more
// can be added from the Admin module.
import crypto from 'node:crypto';
import { prisma } from './db.js';

const SECRET = process.env.AUTH_SECRET || 'amazeon-erp-secret-change-in-railway-env';
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // tokens valid 7 days

// ── Password hashing ──
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return safeEqual(hash, test);
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ── Tokens ──
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

export async function authenticate(username, password) {
  const user = await prisma.user.findUnique({ where: { username: (username || '').trim() } });
  if (!user || !verifyPassword(password, user.passHash)) return null;
  const payload = { u: user.username, role: user.role, exp: Date.now() + TTL_MS };
  return { token: sign(payload), user: { username: user.username, role: user.role } };
}

export async function changePassword(username, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !verifyPassword(currentPassword, user.passHash)) return { error: 'Current password is incorrect.' };
  if (!newPassword || String(newPassword).length < 4) return { error: 'New password must be at least 4 characters.' };
  await prisma.user.update({ where: { id: user.id }, data: { passHash: hashPassword(newPassword) } });
  return { ok: true };
}

function readToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

export function authRequired(req, res, next) {
  const payload = verifyToken(readToken(req));
  if (!payload) return res.status(401).json({ error: 'Please sign in again.' });
  (async () => {
    const dbUser = await prisma.user.findUnique({ where: { username: payload.u }, select: { role: true } });
    if (!dbUser) return res.status(401).json({ error: 'Account no longer exists.' });
    req.user = { username: payload.u, role: dbUser.role };
    next();
  })().catch(next);
}

export function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
    next();
  });
}

export default { authenticate, verifyToken, authRequired, adminRequired };
