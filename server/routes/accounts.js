// Accounts — inflow/outflow ledger. Manual entries (expenses, other
// income) are stored in AccountEntry; the ledger merges them with
// invoices (money in) and purchases (money out) so the period's full
// cash flow is visible and exportable as Excel.
import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';

const router = Router();
router.use(authRequired);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const d10 = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

function range(req) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : '1900-01-01';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : '2999-12-31';
  return { from, to };
}

function entryData(body, username) {
  const kind = body.kind === 'in' ? 'in' : 'out';
  return {
    entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
    kind,
    category: String(body.category || 'General').trim() || 'General',
    description: String(body.description || ''),
    mode: String(body.mode || 'Cash').trim() || 'Cash',
    refNo: String(body.refNo || '').trim(),
    amount: r2(body.amount),
    ...(username ? { createdBy: username } : {}),
  };
}

// Merge manual entries + invoices + purchases into one ledger.
async function buildLedger(from, to) {
  const dateWhere = { gte: new Date(from), lte: new Date(`${to}T23:59:59`) };
  const [manual, invoices, purchases] = await Promise.all([
    prisma.accountEntry.findMany({ where: { entryDate: dateWhere }, orderBy: { entryDate: 'desc' } }),
    prisma.invoice.findMany({
      where: { status: 'active', invoiceDate: dateWhere },
      select: { id: true, invoiceNo: true, invoiceDate: true, buyerName: true, invoiceType: true, grandTotal: true },
    }),
    prisma.purchase.findMany({
      where: { purchaseDate: dateWhere },
      select: { id: true, purchaseDate: true, vendorName: true, billNo: true, totalAmount: true },
    }),
  ]);

  const rows = [
    ...manual.map((e) => ({
      source: 'manual', sourceId: e.id, date: e.entryDate, kind: e.kind,
      category: e.category, description: e.description, mode: e.mode, refNo: e.refNo, amount: r2(e.amount),
    })),
    ...invoices.map((i) => ({
      source: 'invoice', sourceId: i.id, date: i.invoiceDate, kind: 'in',
      category: 'Sales', description: `Invoice ${i.invoiceNo} — ${i.buyerName} (${i.invoiceType})`,
      mode: '', refNo: i.invoiceNo, amount: r2(i.grandTotal),
    })),
    ...purchases.map((p) => ({
      source: 'purchase', sourceId: p.id, date: p.purchaseDate, kind: 'out',
      category: 'Purchases', description: `Purchase — ${p.vendorName}${p.billNo ? ` (Bill ${p.billNo})` : ''}`,
      mode: '', refNo: p.billNo, amount: r2(p.totalAmount),
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const sum = (list) => r2(list.reduce((s, x) => s + x.amount, 0));
  const inRows = rows.filter((x) => x.kind === 'in');
  const outRows = rows.filter((x) => x.kind === 'out');

  const byCategory = {};
  for (const x of rows) {
    const c = byCategory[x.category] || { category: x.category, in: 0, out: 0 };
    c[x.kind] = r2(c[x.kind] + x.amount);
    byCategory[x.category] = c;
  }

  return {
    from, to, rows,
    totals: {
      inflow: sum(inRows), inCount: inRows.length,
      outflow: sum(outRows), outCount: outRows.length,
      net: r2(sum(inRows) - sum(outRows)),
    },
    byCategory: Object.values(byCategory).sort((a, b) => (b.in + b.out) - (a.in + a.out)),
  };
}

// ── Ledger (merged view) ──
router.get('/ledger', async (req, res, next) => {
  try {
    const { from, to } = range(req);
    res.json(await buildLedger(from, to));
  } catch (e) { next(e); }
});

// ── Manual entries CRUD ──
router.post('/', async (req, res, next) => {
  try {
    const data = entryData(req.body || {}, req.user.username);
    if (!(data.amount > 0)) return res.status(400).json({ error: 'Amount must be greater than zero.' });
    res.json(await prisma.accountEntry.create({ data }));
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const data = entryData(req.body || {}, null);
    if (!(data.amount > 0)) return res.status(400).json({ error: 'Amount must be greater than zero.' });
    res.json(await prisma.accountEntry.update({ where: { id: Number(req.params.id) }, data }));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.accountEntry.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Excel export ──
router.get('/ledger.xlsx', async (req, res, next) => {
  try {
    const { from, to } = range(req);
    const ledger = await buildLedger(from, to);
    const wb = new ExcelJS.Workbook();

    const headStyle = (row) => {
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5AA8' } }; });
    };

    const s = wb.addWorksheet('Summary');
    s.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }];
    s.addRow(['Accounts — Inflow / Outflow Summary']).font = { bold: true, size: 14 };
    s.addRow([`Period: ${from} to ${to}`]);
    s.addRow([]);
    headStyle(s.addRow(['Particulars', 'Count', 'Amount (₹)', '']));
    s.addRow(['Money In (inflow)', ledger.totals.inCount, ledger.totals.inflow, '']);
    s.addRow(['Money Out (outflow)', ledger.totals.outCount, ledger.totals.outflow, '']);
    s.addRow(['Net Cash Flow', '', ledger.totals.net, '']).font = { bold: true };
    s.addRow([]);
    headStyle(s.addRow(['Category', 'Money In', 'Money Out', 'Net']));
    for (const c of ledger.byCategory) {
      s.addRow([c.category, c.in, c.out, r2(c.in - c.out)]);
    }

    const l = wb.addWorksheet('Ledger');
    l.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Source', key: 'source', width: 10 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Description', key: 'desc', width: 46 },
      { header: 'Mode', key: 'mode', width: 9 },
      { header: 'Ref', key: 'ref', width: 14 },
      { header: 'Money In', key: 'in', width: 13 },
      { header: 'Money Out', key: 'out', width: 13 },
    ];
    headStyle(l.getRow(1));
    for (const x of [...ledger.rows].reverse()) { // oldest first in the sheet
      l.addRow({
        date: d10(x.date), source: x.source, category: x.category, desc: x.description,
        mode: x.mode, ref: x.refNo,
        in: x.kind === 'in' ? x.amount : '', out: x.kind === 'out' ? x.amount : '',
      });
    }
    const totalRow = l.addRow({ desc: 'TOTAL', in: ledger.totals.inflow, out: ledger.totals.outflow });
    totalRow.font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Accounts-${from}-to-${to}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

export default router;
