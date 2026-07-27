// Partners — the two owners' profit position and withdrawals.
//
// Rules:
//  • A project's profit is only WITHDRAWABLE once the project is closed
//    (stage 'completed'). Profit on open projects is shown as "locked".
//  • Owners may still draw money early — that simply pushes their balance
//    negative until the project closes and the entitlement lands.
//  • balance = entitlement from CLOSED projects − withdrawn.
//  • Losses count too: a closed loss-making project reduces entitlement.
//  • Deleted projects are excluded from every figure.
import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/db.js';
import { authRequired } from '../lib/auth.js';
import { summarize, isClosed, reservePct } from './projects.js';

const router = Router();
router.use(authRequired);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const d10 = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const CASH_MODES = ['Cash'];

async function buildOverview() {
  const [projects, withdrawals, settings, pct] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null },
      include: {
        invoices: { select: { id: true, status: true, grandTotal: true, subTotal: true, commissionEnabled: true, commissionAmount: true } },
        payments: true,
      },
    }),
    prisma.partnerWithdrawal.findMany({
      orderBy: [{ payDate: 'desc' }, { id: 'desc' }],
      include: { project: { select: { id: true, name: true, code: true } } },
    }),
    prisma.companySettings.findUnique({ where: { id: 1 } }),
    reservePct(),
  ]);

  const rows = projects.map((p) => {
    const s = summarize(p, p.invoices, p.payments, pct);
    return { p, s, closed: isClosed(p) };
  });

  const acc = (list, f) => r2(list.reduce((t, x) => t + f(x), 0));
  const closedRows = rows.filter((r) => r.closed);
  const openRows = rows.filter((r) => !r.closed);

  const totals = {
    projects: rows.length,
    closed: closedRows.length,
    open: openRows.length,
    revenue: acc(rows, (r) => r.s.income),
    costs: acc(rows, (r) => r.s.costs),
    pnl: acc(rows, (r) => r.s.pnl),
    reserve: acc(rows, (r) => r.s.reserve),
    distributable: acc(rows, (r) => r.s.distributable),
    reserveClosed: acc(closedRows, (r) => r.s.reserve),
  };

  const drawnBy = (owner) => acc(withdrawals.filter((w) => w.owner === owner), (w) => w.amount);
  const owners = [1, 2].map((owner) => {
    const share = (r) => (owner === 1 ? r.s.pnlOwner1 : r.s.pnlOwner2);
    const entitledClosed = acc(closedRows, share);
    const lockedOpen = acc(openRows, share);
    const withdrawn = drawnBy(owner);
    const balance = r2(entitledClosed - withdrawn); // negative = over-drawn
    return {
      owner,
      name: (owner === 1 ? settings?.owner1Name : settings?.owner2Name) || (owner === 1 ? 'Pradeep' : 'Sony John'),
      entitledClosed,
      lockedOpen,
      lifetimeShare: r2(entitledClosed + lockedOpen),
      withdrawn,
      balance,
      available: Math.max(0, balance), // what they may draw right now
      overdrawn: balance < 0 ? r2(-balance) : 0,
    };
  });

  // ── Company cash position ──
  // Project money in/out + partner withdrawals, split by tender.
  const allPayments = projects.flatMap((p) => p.payments);
  const inflow = allPayments.filter((x) => x.type === 'customer-payment');
  const outflow = allPayments.filter((x) => x.type !== 'customer-payment');
  const bucket = (list, cash) => acc(list.filter((x) => (cash ? CASH_MODES.includes(x.mode) : !CASH_MODES.includes(x.mode))), (x) => x.amount);

  const cashIn = bucket(inflow, true);
  const bankIn = bucket(inflow, false);
  const cashOut = bucket(outflow, true);
  const bankOut = bucket(outflow, false);
  const cashDrawn = bucket(withdrawals, true);
  const bankDrawn = bucket(withdrawals, false);

  const cash = {
    inflow: acc(inflow, (x) => x.amount),
    outflow: acc(outflow, (x) => x.amount),
    withdrawn: acc(withdrawals, (w) => w.amount),
    inHand: r2(cashIn - cashOut - cashDrawn),
    inBank: r2(bankIn - bankOut - bankDrawn),
  };
  cash.net = r2(cash.inHand + cash.inBank);
  // Undrawn profit still sitting with the company (positive balances only).
  cash.pendingToOwners = r2(owners.reduce((t, o) => t + Math.max(0, o.balance), 0));
  cash.retainedReserve = totals.reserve;

  const projectRows = rows
    .sort((a, b) => Number(a.closed) - Number(b.closed) || new Date(b.p.updatedAt) - new Date(a.p.updatedAt))
    .map(({ p, s, closed }) => ({
      id: p.id, code: p.code, name: p.name, stage: p.stage, closed,
      income: s.income, costs: s.costs, pnl: s.pnl,
      reserve: s.reserve, distributable: s.distributable,
      owner1Share: s.owner1Share, owner2Share: s.owner2Share,
      pnlOwner1: s.pnlOwner1, pnlOwner2: s.pnlOwner2,
      drawn1: acc(withdrawals.filter((w) => w.owner === 1 && w.projectId === p.id), (w) => w.amount),
      drawn2: acc(withdrawals.filter((w) => w.owner === 2 && w.projectId === p.id), (w) => w.amount),
    }));

  return {
    reservePercent: pct,
    owner1Name: owners[0].name,
    owner2Name: owners[1].name,
    totals,
    owners,
    cash,
    projects: projectRows,
    withdrawals,
  };
}

router.get('/overview', async (_req, res, next) => {
  try {
    res.json(await buildOverview());
  } catch (e) { next(e); }
});

// ── Withdrawals ──
function withdrawalData(body, username) {
  const owner = Number(body.owner);
  if (owner !== 1 && owner !== 2) throw Object.assign(new Error('Choose which owner is drawing the money.'), { status: 400 });
  const amount = r2(body.amount);
  if (!(amount > 0)) throw Object.assign(new Error('Amount must be greater than zero.'), { status: 400 });
  return {
    owner,
    projectId: body.projectId ? Number(body.projectId) : null,
    payDate: body.payDate ? new Date(body.payDate) : new Date(),
    amount,
    mode: String(body.mode || 'Bank').trim() || 'Bank',
    refNo: String(body.refNo || '').trim(),
    notes: String(body.notes || ''),
    ...(username ? { createdBy: username } : {}),
  };
}

router.post('/withdrawals', async (req, res, next) => {
  try {
    const data = withdrawalData(req.body || {}, req.user.username);
    if (data.projectId) {
      const p = await prisma.project.findUnique({ where: { id: data.projectId } });
      if (!p) return res.status(400).json({ error: 'Selected project no longer exists.' });
    }
    const created = await prisma.partnerWithdrawal.create({
      data,
      include: { project: { select: { id: true, name: true, code: true } } },
    });
    // Advisory only — an early draw is allowed, it just shows as negative.
    const overview = await buildOverview();
    const owner = overview.owners.find((o) => o.owner === data.owner);
    res.json({
      withdrawal: created,
      balance: owner.balance,
      warning: owner.balance < 0
        ? `${owner.name} is now over-drawn by ₹${Math.abs(owner.balance).toLocaleString('en-IN')} — this clears as projects close.`
        : '',
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.put('/withdrawals/:id', async (req, res, next) => {
  try {
    const data = withdrawalData(req.body || {}, null);
    const updated = await prisma.partnerWithdrawal.update({
      where: { id: Number(req.params.id) },
      data,
      include: { project: { select: { id: true, name: true, code: true } } },
    });
    res.json(updated);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.delete('/withdrawals/:id', async (req, res, next) => {
  try {
    await prisma.partnerWithdrawal.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Excel export of the partner position ──
router.get('/overview.xlsx', async (_req, res, next) => {
  try {
    const o = await buildOverview();
    const wb = new ExcelJS.Workbook();
    const headStyle = (row) => {
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5AA8' } }; });
    };

    const s = wb.addWorksheet('Partner Summary');
    s.columns = [{ width: 34 }, { width: 18 }, { width: 18 }];
    s.addRow(['Partner Profit Share']).font = { bold: true, size: 14 };
    s.addRow([`Reserve & surplus retained: ${o.reservePercent}% of profit`]);
    s.addRow([]);
    headStyle(s.addRow(['Particulars', o.owner1Name, o.owner2Name]));
    const [a, b] = o.owners;
    s.addRow(['Share of closed projects (entitled)', a.entitledClosed, b.entitledClosed]);
    s.addRow(['Share locked in open projects', a.lockedOpen, b.lockedOpen]);
    s.addRow(['Withdrawn to date', a.withdrawn, b.withdrawn]);
    s.addRow(['Balance (available / negative)', a.balance, b.balance]).font = { bold: true };
    s.addRow([]);
    headStyle(s.addRow(['Company position', 'Amount', '']));
    s.addRow(['Total revenue', o.totals.revenue, '']);
    s.addRow(['Total costs', o.totals.costs, '']);
    s.addRow(['Total P&L', o.totals.pnl, '']);
    s.addRow(['Retained as reserve', o.totals.reserve, '']);
    s.addRow(['Distributable to owners', o.totals.distributable, '']);
    s.addRow(['Cash in hand', o.cash.inHand, '']);
    s.addRow(['In bank', o.cash.inBank, '']);
    s.addRow(['Pending payout to owners', o.cash.pendingToOwners, '']);

    const p = wb.addWorksheet('By Project');
    p.columns = [
      { header: 'Code', key: 'code', width: 12 }, { header: 'Project', key: 'name', width: 30 },
      { header: 'Closed', key: 'closed', width: 10 }, { header: 'P&L', key: 'pnl', width: 14 },
      { header: 'Reserve', key: 'res', width: 13 }, { header: 'Distributable', key: 'dist', width: 14 },
      { header: `${o.owner1Name} share`, key: 'o1', width: 16 }, { header: `${o.owner1Name} drawn`, key: 'd1', width: 16 },
      { header: `${o.owner2Name} share`, key: 'o2', width: 16 }, { header: `${o.owner2Name} drawn`, key: 'd2', width: 16 },
    ];
    headStyle(p.getRow(1));
    for (const r of o.projects) {
      p.addRow({
        code: r.code, name: r.name, closed: r.closed ? 'Yes' : 'No', pnl: r.pnl,
        res: r.reserve, dist: r.distributable,
        o1: r.pnlOwner1, d1: r.drawn1, o2: r.pnlOwner2, d2: r.drawn2,
      });
    }

    const w = wb.addWorksheet('Withdrawals');
    w.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Owner', key: 'owner', width: 20 },
      { header: 'Project', key: 'proj', width: 28 }, { header: 'Mode', key: 'mode', width: 10 },
      { header: 'Ref', key: 'ref', width: 14 }, { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Amount', key: 'amt', width: 14 },
    ];
    headStyle(w.getRow(1));
    for (const x of [...o.withdrawals].reverse()) {
      w.addRow({
        date: d10(x.payDate), owner: x.owner === 1 ? o.owner1Name : o.owner2Name,
        proj: x.project ? `${x.project.code} — ${x.project.name}` : '(general)',
        mode: x.mode, ref: x.refNo, notes: x.notes, amt: r2(x.amount),
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Partner-Profit-Share.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

export default router;
