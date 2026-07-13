// GST reports — Excel workbook (exceljs) + on-screen JSON summary.
// The workbook covers everything needed for monthly GST filing:
//   Summary · B2B invoices · B2C invoices · Rate-wise tax · HSN summary ·
//   Documents issued · Purchases (input side).
// Cancelled invoices are excluded from all values but appear in the
// documents-issued numbering record.
import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';
import { computeTotals } from '../lib/calc.js';

const router = Router();
router.use(authRequired);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const d10 = (d) => new Date(d).toISOString().slice(0, 10);

function range(req) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : '1900-01-01';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : '2999-12-31';
  return { from, to };
}

function headStyle(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5AA8' } }; });
}

async function send(res, wb, name) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  await wb.xlsx.write(res);
  res.end();
}

async function loadPeriod(from, to) {
  const allDocs = await prisma.invoice.findMany({
    where: { invoiceDate: { gte: new Date(from), lte: new Date(`${to}T23:59:59`) } },
    include: { items: true },
    orderBy: { invoiceDate: 'asc' },
  });
  const invoices = allDocs.filter((i) => i.status !== 'cancelled');
  const cancelled = allDocs.filter((i) => i.status === 'cancelled');
  const b2b = invoices.filter((i) => i.invoiceType === 'B2B');
  const b2c = invoices.filter((i) => i.invoiceType === 'B2C');
  const purchases = await prisma.purchase.findMany({
    where: { purchaseDate: { gte: new Date(from), lte: new Date(`${to}T23:59:59`) } },
    orderBy: { purchaseDate: 'asc' },
    include: { files: { select: { id: true, filename: true } } },
  });
  return { allDocs, invoices, cancelled, b2b, b2c, purchases };
}

const sum = (list, f) => r2(list.reduce((s, i) => s + (f(i) || 0), 0));

function buildSummary({ invoices, cancelled, b2b, b2c, purchases }) {
  const totalTax = (i) => r2((i.cgstAmount || 0) + (i.sgstAmount || 0) + (i.igstAmount || 0));
  return {
    sales: {
      count: invoices.length,
      taxable: sum(invoices, (i) => i.subTotal),
      cgst: sum(invoices, (i) => i.cgstAmount),
      sgst: sum(invoices, (i) => i.sgstAmount),
      igst: sum(invoices, (i) => i.igstAmount),
      tax: sum(invoices, totalTax),
      total: sum(invoices, (i) => i.grandTotal),
    },
    b2b: { count: b2b.length, taxable: sum(b2b, (i) => i.subTotal), tax: sum(b2b, totalTax), total: sum(b2b, (i) => i.grandTotal) },
    b2c: { count: b2c.length, taxable: sum(b2c, (i) => i.subTotal), tax: sum(b2c, totalTax), total: sum(b2c, (i) => i.grandTotal) },
    cancelled: { count: cancelled.length },
    purchases: {
      count: purchases.length,
      taxable: sum(purchases, (p) => p.taxableValue),
      tax: sum(purchases, (p) => (p.cgst || 0) + (p.sgst || 0) + (p.igst || 0)),
      total: sum(purchases, (p) => p.totalAmount),
    },
  };
}

// Rate-wise + HSN-wise aggregation over active invoices.
function aggregate(invoices) {
  const byRate = new Map();
  const byHsn = new Map();
  for (const inv of invoices) {
    const totals = computeTotals(inv);
    for (const g of totals.taxBreakup) {
      const cur = byRate.get(g.rate) || { rate: g.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      cur.taxable = r2(cur.taxable + g.taxable);
      cur.cgst = r2(cur.cgst + g.cgst);
      cur.sgst = r2(cur.sgst + g.sgst);
      cur.igst = r2(cur.igst + g.igst);
      byRate.set(g.rate, cur);
    }
    for (const it of totals.items) {
      const key = it.hsnCode || '(none)';
      const cur = byHsn.get(key) || { hsn: key, desc: it.description, qty: 0, unit: it.unit || '', taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      cur.qty += Number(it.qty) || 0;
      cur.taxable = r2(cur.taxable + it.taxable);
      const tax = r2((it.taxable * (it.gstRate || 0)) / 100);
      if (totals.taxMode === 'inter') cur.igst = r2(cur.igst + tax);
      else { cur.cgst = r2(cur.cgst + tax / 2); cur.sgst = r2(cur.sgst + tax / 2); }
      byHsn.set(key, cur);
    }
  }
  return {
    rates: [...byRate.values()].sort((a, b) => a.rate - b.rate),
    hsn: [...byHsn.values()].sort((a, b) => a.hsn.localeCompare(b.hsn)),
  };
}

// ── On-screen summary (JSON) ──
router.get('/gst-summary', async (req, res, next) => {
  try {
    const { from, to } = range(req);
    const data = await loadPeriod(from, to);
    const agg = aggregate(data.invoices);
    res.json({ from, to, ...buildSummary(data), rates: agg.rates });
  } catch (e) { next(e); }
});

// ── Excel GST report ──
router.get('/gst.xlsx', async (req, res, next) => {
  try {
    const { from, to } = range(req);
    const data = await loadPeriod(from, to);
    const { invoices, cancelled, b2b, b2c, purchases, allDocs } = data;
    const summary = buildSummary(data);
    const agg = aggregate(invoices);

    const wb = new ExcelJS.Workbook();

    // ── Summary ──
    const s = wb.addWorksheet('Summary');
    s.columns = [{ width: 40 }, { width: 12 }, { width: 18 }, { width: 16 }, { width: 18 }];
    s.addRow(['GST Report — Amazeon Shopping (OE Belts & Conveyors)']).font = { bold: true, size: 14 };
    s.addRow([`Period: ${from} to ${to}`]);
    s.addRow([]);
    headStyle(s.addRow(['Particulars', 'Count', 'Taxable Value', 'Tax Collected', 'Invoice Total']));
    s.addRow(['Total Outward Supplies (invoices)', summary.sales.count, summary.sales.taxable, summary.sales.tax, summary.sales.total]).font = { bold: true };
    s.addRow(['B2B Supplies (registered recipients)', summary.b2b.count, summary.b2b.taxable, summary.b2b.tax, summary.b2b.total]);
    s.addRow(['B2C Supplies (unregistered recipients)', summary.b2c.count, summary.b2c.taxable, summary.b2c.tax, summary.b2c.total]);
    const cRow = s.addRow(['Cancelled Invoices (numbering only — no value)', summary.cancelled.count, '', '', '']);
    cRow.getCell(1).font = { italic: true, color: { argb: 'FF98A2B3' } };
    s.addRow([]);
    headStyle(s.addRow(['Tax Heads', '', '', 'Amount', '']));
    s.addRow(['CGST collected', '', '', summary.sales.cgst, '']);
    s.addRow(['SGST collected', '', '', summary.sales.sgst, '']);
    s.addRow(['IGST collected', '', '', summary.sales.igst, '']);
    s.addRow(['Total tax collected', '', '', summary.sales.tax, '']).font = { bold: true };
    s.addRow([]);
    headStyle(s.addRow(['Purchases (input side)', 'Count', 'Taxable Value', 'Tax Paid', 'Bill Total']));
    s.addRow(['Purchases recorded in period', summary.purchases.count, summary.purchases.taxable, summary.purchases.tax, summary.purchases.total]);

    // Documents issued (GSTR-1 Table 13 style)
    s.addRow([]);
    s.addRow(['DOCUMENTS ISSUED DURING THE PERIOD']).font = { bold: true, size: 12 };
    headStyle(s.addRow(['Series (by prefix)', 'From — To', 'Total Issued', 'Cancelled', 'Net Issued']));
    const seriesOf = (no) => { const m = (no || '').match(/^(.*?)(\d+)$/); return m ? m[1] || '(no prefix)' : '(other)'; };
    const seqNum = (no) => { const m = (no || '').match(/(\d+)$/); return m ? Number(m[1]) : 0; };
    const bySeries = new Map();
    for (const inv of allDocs) {
      const key = seriesOf(inv.invoiceNo);
      const cur = bySeries.get(key) || { nos: [], cancelled: [] };
      cur.nos.push(inv.invoiceNo);
      if (inv.status === 'cancelled') cur.cancelled.push(inv.invoiceNo);
      bySeries.set(key, cur);
    }
    for (const [prefix, g] of [...bySeries.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const sorted = [...g.nos].sort((a, b) => seqNum(a) - seqNum(b));
      s.addRow([prefix, `${sorted[0]} — ${sorted[sorted.length - 1]}`, g.nos.length, g.cancelled.length, g.nos.length - g.cancelled.length]);
    }
    if (cancelled.length) {
      s.addRow(['Cancelled invoice numbers', cancelled.map((i) => i.invoiceNo).join(', ')]).font = { italic: true };
    }

    // ── B2B / B2C detail sheets ──
    const detailCols = [
      { header: 'Invoice No', key: 'no', width: 16 }, { header: 'Date', key: 'date', width: 12 },
      { header: 'Customer', key: 'cust', width: 28 }, { header: 'GSTIN', key: 'gstn', width: 18 },
      { header: 'Place of Supply', key: 'pos', width: 20 }, { header: 'Supply Type', key: 'mode', width: 12 },
      { header: 'Taxable Value', key: 'sub', width: 14 }, { header: 'CGST', key: 'cgst', width: 11 },
      { header: 'SGST', key: 'sgst', width: 11 }, { header: 'IGST', key: 'igst', width: 11 },
      { header: 'Invoice Total', key: 'tot', width: 14 },
    ];
    const fill = (ws, list) => {
      ws.columns = detailCols;
      headStyle(ws.getRow(1));
      for (const i of list) {
        ws.addRow({
          no: i.invoiceNo, date: d10(i.invoiceDate), cust: i.buyerName, gstn: i.buyerGstin,
          pos: i.placeOfSupply, mode: i.taxMode === 'inter' ? 'Inter-State' : 'Intra-State',
          sub: r2(i.subTotal), cgst: r2(i.cgstAmount), sgst: r2(i.sgstAmount), igst: r2(i.igstAmount), tot: r2(i.grandTotal),
        });
      }
    };
    fill(wb.addWorksheet('B2B Invoices'), b2b);
    fill(wb.addWorksheet('B2C Invoices'), b2c);

    // ── Rate-wise summary ──
    const rw = wb.addWorksheet('Rate-wise Summary');
    rw.columns = [
      { header: 'GST Rate %', key: 'rate', width: 12 }, { header: 'Taxable Value', key: 'taxable', width: 16 },
      { header: 'CGST', key: 'cgst', width: 13 }, { header: 'SGST', key: 'sgst', width: 13 },
      { header: 'IGST', key: 'igst', width: 13 }, { header: 'Total Tax', key: 'tax', width: 14 },
    ];
    headStyle(rw.getRow(1));
    for (const g of agg.rates) {
      rw.addRow({ rate: g.rate, taxable: g.taxable, cgst: g.cgst, sgst: g.sgst, igst: g.igst, tax: r2(g.cgst + g.sgst + g.igst) });
    }
    rw.addRow({
      rate: 'TOTAL',
      taxable: sum(agg.rates, (g) => g.taxable), cgst: sum(agg.rates, (g) => g.cgst),
      sgst: sum(agg.rates, (g) => g.sgst), igst: sum(agg.rates, (g) => g.igst),
      tax: sum(agg.rates, (g) => g.cgst + g.sgst + g.igst),
    }).font = { bold: true };

    // ── HSN summary ──
    const h = wb.addWorksheet('HSN Summary');
    h.columns = [
      { header: 'HSN/SAC', key: 'hsn', width: 14 }, { header: 'Description (sample)', key: 'desc', width: 40 },
      { header: 'Qty', key: 'qty', width: 10 }, { header: 'Unit', key: 'unit', width: 8 },
      { header: 'Taxable Value', key: 'taxable', width: 16 }, { header: 'CGST', key: 'cgst', width: 12 },
      { header: 'SGST', key: 'sgst', width: 12 }, { header: 'IGST', key: 'igst', width: 12 },
    ];
    headStyle(h.getRow(1));
    agg.hsn.forEach((x) => h.addRow(x));

    // ── Purchases sheet ──
    const p = wb.addWorksheet('Purchases');
    p.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Vendor', key: 'v', width: 28 },
      { header: 'Vendor GSTIN', key: 'g', width: 18 }, { header: 'Bill No', key: 'b', width: 14 },
      { header: 'Description', key: 'd', width: 32 }, { header: 'Taxable Value', key: 't', width: 14 },
      { header: 'CGST', key: 'cg', width: 11 }, { header: 'SGST', key: 'sg', width: 11 }, { header: 'IGST', key: 'ig', width: 11 },
      { header: 'Bill Total', key: 'tot', width: 13 }, { header: 'Entry', key: 'e', width: 9 }, { header: 'Documents', key: 'f', width: 30 },
    ];
    headStyle(p.getRow(1));
    for (const x of purchases) {
      p.addRow({
        date: d10(x.purchaseDate), v: x.vendorName, g: x.vendorGstin, b: x.billNo, d: x.description,
        t: r2(x.taxableValue), cg: r2(x.cgst), sg: r2(x.sgst), ig: r2(x.igst), tot: r2(x.totalAmount),
        e: x.entryType, f: (x.files || []).map((f) => f.filename).join(', '),
      });
    }

    await send(res, wb, `GST-Report-${from}-to-${to}.xlsx`);
  } catch (e) { next(e); }
});

export default router;
