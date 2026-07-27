// Invoice / company settings (singleton row, id = 1). Every printable
// element of the invoice — company block, payment settings, boilerplate
// footer lines, numbering — is editable here.
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';

const router = Router();
router.use(authRequired);

const STRING_FIELDS = [
  'companyName', 'tagline', 'gstin', 'stateName', 'stateCode', 'email', 'phone',
  'invoiceTitle', 'invoicePrefix', 'paymentTerms', 'bankName', 'bankAccountName',
  'bankAccount', 'bankIfsc', 'bankBranch', 'upiId', 'declaration', 'signatory',
  'owner1Name', 'owner2Name',
];
const LIST_FIELDS = ['addressLines', 'footerLines', 'termsLines'];
const BOOL_FIELDS = ['showBankDetails', 'showUpi'];
const IMAGE_FIELDS = ['logoDataUrl', 'signatureDataUrl'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // ~2MB as data URL

router.get('/', async (_req, res, next) => {
  try {
    const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });
    res.json(settings);
  } catch (e) { next(e); }
});

router.put('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const data = {};
    for (const f of STRING_FIELDS) if (f in body) data[f] = String(body[f] ?? '');
    for (const f of LIST_FIELDS) if (f in body) data[f] = Array.isArray(body[f]) ? body[f].map(String) : [];
    for (const f of BOOL_FIELDS) if (f in body) data[f] = !!body[f];
    for (const f of IMAGE_FIELDS) {
      if (f in body) {
        const v = body[f];
        if (v === null || v === '') { data[f] = null; continue; }
        if (typeof v !== 'string' || !v.startsWith('data:image')) {
          return res.status(400).json({ error: `${f} must be an image.` });
        }
        if (v.length > MAX_IMAGE_BYTES * 1.4) {
          return res.status(400).json({ error: 'Image too large — keep it under 2MB.' });
        }
        data[f] = v;
      }
    }
    if ('reservePercent' in body) {
      const n = Number(body.reservePercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) return res.status(400).json({ error: 'Reserve must be between 0 and 100%.' });
      data.reservePercent = Math.round(n * 100) / 100;
    }
    if ('nextInvoiceSeq' in body) {
      const n = Number(body.nextInvoiceSeq);
      if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Next invoice number must be a positive integer.' });
      data.nextInvoiceSeq = n;
    }
    const settings = await prisma.companySettings.update({ where: { id: 1 }, data });
    res.json(settings);
  } catch (e) { next(e); }
});

export default router;
