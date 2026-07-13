// Idempotent seed: the two owner accounts + the CompanySettings singleton.
// Runs on every boot (safe to re-run) — it only creates what is missing.
import 'dotenv/config';
import { prisma } from './db.js';
import { hashPassword } from './auth.js';

const OWNERS = [
  { username: process.env.ADMIN1_USER || 'admin1', password: process.env.ADMIN1_PASS || 'admin123' },
  { username: process.env.ADMIN2_USER || 'admin2', password: process.env.ADMIN2_PASS || 'admin123' },
];

const DEFAULT_FOOTER_LINES = [
  'Goods once sold will not be taken back or exchanged.',
  'Interest @18% p.a. will be charged on invoices not paid within the due date.',
  'Subject to local jurisdiction only. E. & O.E.',
];

const DEFAULT_TERMS_LINES = [
  'Payment due as per the agreed payment terms stated above.',
  'Please quote the invoice number in all payment references.',
];

export async function seed() {
  for (const o of OWNERS) {
    const existing = await prisma.user.findUnique({ where: { username: o.username } });
    if (!existing) {
      await prisma.user.create({
        data: { username: o.username, passHash: hashPassword(o.password), role: 'admin' },
      });
      console.log(`[seed] created owner account "${o.username}"`);
    }
  }

  const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    await prisma.companySettings.create({
      data: {
        id: 1,
        companyName: 'Amazeon Shopping',
        tagline: 'OE Belts & Conveyors',
        addressLines: ['<Street / Building>', '<City, PIN>'],
        footerLines: DEFAULT_FOOTER_LINES,
        termsLines: DEFAULT_TERMS_LINES,
      },
    });
    console.log('[seed] created default company settings');
  }
}

// Allow `npm run seed` standalone.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
