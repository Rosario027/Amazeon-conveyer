// Purchases: manual entries AND uploaded bills (PDF / image / any doc).
// Uploaded files are stored in PostgreSQL (bytea) so they live with the
// database backup and can be retrieved any time — downloads go through
// the authenticated API only.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';

const router = Router();
router.use(authRequired);

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB per file
const ALLOWED_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|gif|heic)|application\/vnd\.openxmlformats|application\/msword|application\/vnd\.ms-excel|text\/csv)/i;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function parseFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.map((f) => {
    const filename = String(f.filename || 'document').slice(0, 200);
    const mimeType = String(f.mimeType || 'application/octet-stream');
    if (!ALLOWED_MIME.test(mimeType)) {
      throw Object.assign(new Error(`"${filename}": only PDF, images and office documents are allowed.`), { status: 400 });
    }
    const b64 = String(f.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
    const data = Buffer.from(b64, 'base64');
    if (!data.length) throw Object.assign(new Error(`"${filename}" is empty.`), { status: 400 });
    if (data.length > MAX_FILE_BYTES) {
      throw Object.assign(new Error(`"${filename}" is too large — keep each file under 10MB.`), { status: 400 });
    }
    return { filename, mimeType, size: data.length, data };
  });
}

function purchaseData(body, username) {
  return {
    purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : new Date(),
    vendorName: String(body.vendorName || '').trim(),
    vendorGstin: String(body.vendorGstin || '').trim().toUpperCase(),
    billNo: String(body.billNo || '').trim(),
    description: String(body.description || ''),
    taxableValue: r2(body.taxableValue),
    cgst: r2(body.cgst),
    sgst: r2(body.sgst),
    igst: r2(body.igst),
    totalAmount: r2(body.totalAmount) || r2((Number(body.taxableValue) || 0) + (Number(body.cgst) || 0) + (Number(body.sgst) || 0) + (Number(body.igst) || 0)),
    notes: String(body.notes || ''),
    ...(username ? { createdBy: username } : {}),
  };
}

// ── List (filters: from, to, q) — file metadata only, never the bytes ──
router.get('/', async (req, res, next) => {
  try {
    const { from, to, q } = req.query;
    const where = {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(from || '') || /^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
      where.purchaseDate = {};
      if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) where.purchaseDate.gte = new Date(from);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to || '')) where.purchaseDate.lte = new Date(`${to}T23:59:59`);
    }
    if (q) {
      where.OR = [
        { vendorName: { contains: String(q), mode: 'insensitive' } },
        { billNo: { contains: String(q), mode: 'insensitive' } },
        { vendorGstin: { contains: String(q), mode: 'insensitive' } },
      ];
    }
    const purchases = await prisma.purchase.findMany({
      where,
      orderBy: [{ purchaseDate: 'desc' }, { id: 'desc' }],
      take: 300,
      include: { files: { select: { id: true, filename: true, mimeType: true, size: true, uploadedAt: true } } },
    });
    res.json(purchases);
  } catch (e) { next(e); }
});

// ── Create (manual or upload; files travel as base64 in JSON) ──
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const data = purchaseData(body, req.user.username);
    if (!data.vendorName) return res.status(400).json({ error: 'Vendor name is required.' });
    const files = parseFiles(body.files);
    const purchase = await prisma.purchase.create({
      data: {
        ...data,
        entryType: files.length ? 'upload' : 'manual',
        files: { create: files },
      },
      include: { files: { select: { id: true, filename: true, mimeType: true, size: true, uploadedAt: true } } },
    });
    res.json(purchase);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const purchase = await prisma.purchase.update({
      where: { id: Number(req.params.id) },
      data: purchaseData(req.body || {}, null),
      include: { files: { select: { id: true, filename: true, mimeType: true, size: true, uploadedAt: true } } },
    });
    res.json(purchase);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.purchase.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Attach more files later ──
router.post('/:id/files', async (req, res, next) => {
  try {
    const purchaseId = Number(req.params.id);
    const files = parseFiles((req.body || {}).files);
    if (!files.length) return res.status(400).json({ error: 'No files supplied.' });
    await prisma.purchaseFile.createMany({ data: files.map((f) => ({ ...f, purchaseId })) });
    await prisma.purchase.update({ where: { id: purchaseId }, data: { entryType: 'upload' } });
    const fresh = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { files: { select: { id: true, filename: true, mimeType: true, size: true, uploadedAt: true } } },
    });
    res.json(fresh);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// ── Retrieve a stored document (authenticated download) ──
router.get('/:id/files/:fileId', async (req, res, next) => {
  try {
    const file = await prisma.purchaseFile.findFirst({
      where: { id: Number(req.params.fileId), purchaseId: Number(req.params.id) },
    });
    if (!file) return res.status(404).json({ error: 'File not found.' });
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename.replace(/[^\w.\- ]+/g, '_')}"`);
    res.send(Buffer.from(file.data));
  } catch (e) { next(e); }
});

router.delete('/:id/files/:fileId', async (req, res, next) => {
  try {
    await prisma.purchaseFile.deleteMany({
      where: { id: Number(req.params.fileId), purchaseId: Number(req.params.id) },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
