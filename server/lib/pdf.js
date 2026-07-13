// Server-side invoice PDF via pdfmake's printer (standard Helvetica fonts,
// no font files needed). Layout follows GST tax-invoice requirements:
// supplier block + GSTIN, serial no & date, buyer + GSTIN (B2B), place of
// supply, reverse-charge flag, HSN/part columns, rate-wise CGST/SGST or
// IGST breakup, amount in words, payment settings + boilerplate footer.
import PdfPrinter from 'pdfmake/src/printer.js';
import { computeTotals } from './calc.js';
import { formatINR, formatRate } from './money.js';

const FONTS = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const printer = new PdfPrinter(FONTS);

// Amazeon brand palette
const C = {
  blue: '#1e5aa8',
  orange: '#ef8722',
  ink: '#232b35',
  muted: '#68758a',
  headBg: '#1e5aa8',
  headText: '#ffffff',
  zebra: '#f4f7fb',
  soft: '#eaf1fa',
  line: '#d9e1ec',
};

const RUPEE = 'Rs.';
const fmt = (n) => `${RUPEE} ${formatINR(n)}`;

function fmtDate(d) {
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${dt.getFullYear()}`;
}

// Built-in conveyor logomark used when no logo is uploaded in settings.
const LOGO_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
<g fill="none" stroke="#1e5aa8" stroke-width="7" stroke-linecap="round">
<path d="M18 78 H102"/><path d="M24 96 H96"/>
</g>
<circle cx="30" cy="87" r="8" fill="none" stroke="#1e5aa8" stroke-width="5"/>
<circle cx="60" cy="87" r="8" fill="none" stroke="#1e5aa8" stroke-width="5"/>
<circle cx="90" cy="87" r="8" fill="none" stroke="#1e5aa8" stroke-width="5"/>
<rect x="30" y="52" width="24" height="20" rx="3" fill="#ef8722"/>
<rect x="62" y="56" width="18" height="16" rx="3" fill="#1e5aa8"/>
<path d="M34 44 C46 18 78 14 96 30" fill="none" stroke="#ef8722" stroke-width="8" stroke-linecap="round"/>
<path d="M88 16 L100 32 L80 36 Z" fill="#ef8722"/>
</svg>`;

function logoNode(settings) {
  if (settings.logoDataUrl && settings.logoDataUrl.startsWith('data:image')) {
    return { image: settings.logoDataUrl, fit: [110, 56] };
  }
  return { svg: LOGO_MARK_SVG, width: 52, height: 52 };
}

function partyBlock(title, lines) {
  return {
    width: '*',
    table: {
      widths: ['*'],
      body: [
        [{ text: title, fontSize: 8, bold: true, color: C.headText, characterSpacing: 1 }],
        [{ stack: lines.filter(Boolean) }],
      ],
    },
    layout: {
      fillColor: (rowIndex) => (rowIndex === 0 ? C.headBg : null),
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => C.line,
      vLineColor: () => C.line,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  };
}

export function buildDocDefinition(invoice, settings) {
  const totals = computeTotals(invoice);
  const items = totals.items;
  const isInter = totals.taxMode === 'inter';
  const isCancelled = invoice.status === 'cancelled';

  // ── Header ──
  const companyBlock = {
    width: '*',
    stack: [
      { text: settings.companyName, bold: true, fontSize: 16, color: C.blue },
      settings.tagline ? { text: settings.tagline.toUpperCase(), fontSize: 8, bold: true, color: C.orange, margin: [0, 1, 0, 3], characterSpacing: 0.5 } : null,
      ...(settings.addressLines || []).map((l) => ({ text: l, fontSize: 8, color: C.ink })),
      settings.phone ? { text: `Mob: ${settings.phone}`, fontSize: 8, color: C.ink, margin: [0, 2, 0, 0] } : null,
      settings.email ? { text: settings.email, fontSize: 8, color: C.ink } : null,
      { text: `GSTIN: ${settings.gstin || '-'}`, fontSize: 8, bold: true, color: C.ink, margin: [0, 2, 0, 0] },
      { text: `State: ${settings.stateName} (Code: ${settings.stateCode})`, fontSize: 8, color: C.ink },
    ].filter(Boolean),
  };

  const titleBlock = {
    width: 200,
    stack: [
      { text: invoice.title || settings.invoiceTitle || 'TAX INVOICE', bold: true, fontSize: 17, color: C.ink, alignment: 'right' },
      { text: invoice.invoiceType === 'B2C' ? 'B2C — Unregistered Recipient' : 'B2B — Registered Recipient', fontSize: 8, bold: true, color: C.orange, alignment: 'right', margin: [0, 1, 0, 6] },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [{ text: 'Invoice No', fontSize: 8, color: C.muted, alignment: 'right' }, { text: invoice.invoiceNo, fontSize: 9, bold: true, alignment: 'right' }],
            [{ text: 'Date', fontSize: 8, color: C.muted, alignment: 'right' }, { text: fmtDate(invoice.invoiceDate), fontSize: 9, bold: true, alignment: 'right' }],
            [{ text: 'Place of Supply', fontSize: 8, color: C.muted, alignment: 'right' }, { text: invoice.placeOfSupply || `${invoice.buyerStateName} (${invoice.buyerStateCode})` || '-', fontSize: 9, alignment: 'right' }],
            [{ text: 'Reverse Charge', fontSize: 8, color: C.muted, alignment: 'right' }, { text: invoice.reverseCharge ? 'Yes' : 'No', fontSize: 9, alignment: 'right' }],
          ],
        },
        layout: 'noBorders',
      },
    ],
  };

  // ── Meta strip ──
  const metaStrip = {
    table: {
      widths: ['*', '*', '*'],
      body: [
        [
          { text: [{ text: 'PO / Ref No: ', color: C.muted, fontSize: 8 }, { text: invoice.poRefNo || '-', fontSize: 8, bold: true }] },
          { text: [{ text: 'Payment Terms: ', color: C.muted, fontSize: 8 }, { text: invoice.paymentTerms || settings.paymentTerms || '-', fontSize: 8, bold: true }] },
          { text: [{ text: 'Supply Type: ', color: C.muted, fontSize: 8 }, { text: isInter ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)', fontSize: 8, bold: true }] },
        ],
      ],
    },
    layout: {
      fillColor: () => C.soft,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    margin: [0, 10, 0, 10],
  };

  // ── Bill To / Ship To ──
  const buyerCommon = [
    { text: invoice.buyerName, bold: true, fontSize: 10, margin: [0, 0, 0, 2] },
  ];
  const billLines = [
    ...buyerCommon,
    ...String(invoice.billTo || '').split('\n').filter(Boolean).map((l) => ({ text: l, fontSize: 8, color: C.ink })),
    invoice.buyerPhone ? { text: `Phone: ${invoice.buyerPhone}`, fontSize: 8, margin: [0, 2, 0, 0] } : null,
    invoice.buyerEmail ? { text: `Email: ${invoice.buyerEmail}`, fontSize: 8 } : null,
    invoice.buyerGstin ? { text: `GSTIN: ${invoice.buyerGstin}`, fontSize: 8, bold: true, margin: [0, 2, 0, 0] } : null,
    invoice.buyerStateName ? { text: `State: ${invoice.buyerStateName} (Code: ${invoice.buyerStateCode || '-'})`, fontSize: 8 } : null,
  ];
  const shipLines = [
    ...buyerCommon,
    ...String(invoice.shipTo || invoice.billTo || '').split('\n').filter(Boolean).map((l) => ({ text: l, fontSize: 8, color: C.ink })),
  ];

  const parties = {
    columns: [partyBlock('BILL TO', billLines), partyBlock('SHIP TO', shipLines)],
    columnGap: 10,
    margin: [0, 0, 0, 10],
  };

  // ── Items table ──
  const showPart = items.some((it) => (it.partNo || '').toString().trim() !== '');

  const headRow = [
    { text: 'SL', style: 'th', alignment: 'center' },
    { text: 'DESCRIPTION', style: 'th' },
    { text: 'HSN/SAC', style: 'th', alignment: 'center' },
    ...(showPart ? [{ text: 'PART NO', style: 'th', alignment: 'center' }] : []),
    { text: 'QTY', style: 'th', alignment: 'center' },
    { text: 'RATE', style: 'th', alignment: 'right' },
    { text: 'GST%', style: 'th', alignment: 'center' },
    { text: 'AMOUNT', style: 'th', alignment: 'right' },
  ];

  const itemRows = items.map((it, i) => [
    { text: String(i + 1), alignment: 'center', fontSize: 9, margin: [0, 2, 0, 2] },
    { text: it.description || '', fontSize: 9, margin: [0, 2, 0, 2] },
    { text: it.hsnCode || '', alignment: 'center', fontSize: 9, margin: [0, 2, 0, 2] },
    ...(showPart ? [{ text: it.partNo || '', alignment: 'center', fontSize: 9, margin: [0, 2, 0, 2] }] : []),
    { text: `${formatINR(it.qty, false)} ${it.unit || ''}`.trim(), alignment: 'center', fontSize: 9, margin: [0, 2, 0, 2] },
    { text: formatINR(it.rate), alignment: 'right', fontSize: 9, margin: [0, 2, 0, 2] },
    { text: `${formatRate(it.gstRate)}%`, alignment: 'center', fontSize: 9, margin: [0, 2, 0, 2] },
    { text: formatINR(it.taxable), alignment: 'right', fontSize: 9, margin: [0, 2, 0, 2] },
  ]);

  const minRows = 4;
  const blankCells = 7 + (showPart ? 1 : 0);
  while (itemRows.length < minRows) {
    itemRows.push(Array.from({ length: blankCells }, (_, i) => (i === 0 ? { text: ' ', fontSize: 9, margin: [0, 2, 0, 2] } : {})));
  }

  const itemsTable = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: showPart ? [18, '*', 44, 48, 40, 52, 30, 60] : [18, '*', 46, 42, 56, 32, 62],
      body: [headRow, ...itemRows],
    },
    layout: {
      fillColor: (rowIndex) => (rowIndex === 0 ? C.headBg : rowIndex % 2 === 0 ? C.zebra : null),
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => C.line,
      vLineColor: () => C.line,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
  };

  // ── Totals (right column, rate-wise) ──
  const totalsBody = [
    [{ text: 'Taxable Value', style: 'tlabel' }, { text: fmt(totals.subTotal), style: 'tval' }],
  ];
  for (const g of totals.taxBreakup) {
    if (isInter) {
      totalsBody.push([{ text: `IGST @ ${formatRate(g.rate)}%`, style: 'tlabel' }, { text: fmt(g.igst), style: 'tval' }]);
    } else {
      totalsBody.push([{ text: `CGST @ ${formatRate(g.half)}%`, style: 'tlabel' }, { text: fmt(g.cgst), style: 'tval' }]);
      totalsBody.push([{ text: `SGST @ ${formatRate(g.half)}%`, style: 'tlabel' }, { text: fmt(g.sgst), style: 'tval' }]);
    }
  }
  if (Math.abs(totals.roundOff) >= 0.005) {
    totalsBody.push([{ text: 'Round Off', style: 'tlabel' }, { text: fmt(totals.roundOff), style: 'tval' }]);
  }
  totalsBody.push([
    { text: 'TOTAL', bold: true, color: '#ffffff', fillColor: C.orange, margin: [6, 4, 6, 4] },
    { text: fmt(totals.grandTotal), bold: true, alignment: 'right', color: '#ffffff', fillColor: C.orange, margin: [6, 4, 6, 4] },
  ]);

  const totalsTable = {
    columns: [
      { width: '*', text: '' },
      {
        width: 240,
        table: { widths: ['*', 'auto'], body: totalsBody },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => C.line,
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
      },
    ],
    margin: [0, 8, 0, 8],
  };

  const amountWords = {
    text: [{ text: 'Amount in Words: ', bold: true, fontSize: 9 }, { text: totals.amountWords, fontSize: 9, italics: true }],
    margin: [0, 0, 0, 10],
  };

  // ── Footer: payment settings + boilerplate (left), signatory (right) ──
  const payLines = [];
  if (settings.showBankDetails) {
    if (settings.bankAccountName) payLines.push({ text: `A/C Name: ${settings.bankAccountName}`, fontSize: 8 });
    if (settings.bankName) payLines.push({ text: `Bank: ${settings.bankName}`, fontSize: 8 });
    if (settings.bankAccount) payLines.push({ text: `A/C No: ${settings.bankAccount}`, fontSize: 8 });
    if (settings.bankIfsc) payLines.push({ text: `IFSC: ${settings.bankIfsc}${settings.bankBranch ? '  (' + settings.bankBranch + ')' : ''}`, fontSize: 8 });
  }
  if (settings.showUpi && settings.upiId) payLines.push({ text: `UPI: ${settings.upiId}`, fontSize: 8 });

  const termsLines = (settings.termsLines || []).filter(Boolean);
  const footerLines = (settings.footerLines || []).filter(Boolean);

  const footer = {
    columns: [
      {
        width: '*',
        stack: [
          payLines.length ? { text: 'Payment Details', bold: true, fontSize: 8, color: C.blue, margin: [0, 0, 0, 2] } : null,
          ...payLines,
          termsLines.length ? { text: 'Terms', bold: true, fontSize: 8, color: C.blue, margin: [0, 6, 0, 2] } : null,
          ...termsLines.map((l) => ({ text: '• ' + l, fontSize: 7.5, color: C.ink })),
          settings.declaration ? { text: settings.declaration, fontSize: 7.5, italics: true, color: C.muted, margin: [0, 6, 0, 0] } : null,
          ...footerLines.map((l, i) => ({ text: l, fontSize: 7.5, color: C.muted, margin: [0, i === 0 ? 6 : 1, 0, 0] })),
        ].filter(Boolean),
      },
      {
        width: 180,
        stack: [
          { text: `For ${settings.companyName}`, fontSize: 9, bold: true, alignment: 'center', margin: [0, 0, 0, 30] },
          settings.signatureDataUrl && settings.signatureDataUrl.startsWith('data:image')
            ? { image: settings.signatureDataUrl, fit: [120, 40], alignment: 'center' }
            : null,
          { canvas: [{ type: 'line', x1: 30, y1: 0, x2: 150, y2: 0, lineWidth: 0.5, lineColor: C.muted }], margin: [0, 0, 0, 2] },
          { text: settings.signatory || 'Authorised Signatory', fontSize: 8, alignment: 'center', color: C.muted },
        ].filter(Boolean),
      },
    ],
  };

  return {
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 44],
    watermark: isCancelled ? { text: 'CANCELLED', color: '#d92d20', opacity: 0.12, bold: true } : undefined,
    footer: (currentPage, pageCount) => (pageCount > 1 ? {
      columns: [
        { text: settings.companyName, fontSize: 7, color: C.muted, margin: [36, 0, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 7, color: C.muted, alignment: 'right', margin: [0, 0, 36, 0] },
      ],
    } : null),
    defaultStyle: { font: 'Helvetica', fontSize: 9, color: C.ink, lineHeight: 1.15 },
    styles: {
      th: { bold: true, fontSize: 8.5, color: C.headText, margin: [0, 2, 0, 2] },
      tlabel: { fontSize: 9, color: C.muted },
      tval: { fontSize: 9, alignment: 'right' },
    },
    content: [
      {
        columns: [
          { width: 'auto', stack: [logoNode(settings)], margin: [0, 0, 12, 0] },
          companyBlock,
          titleBlock,
        ],
        columnGap: 10,
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 2, lineColor: C.orange }], margin: [0, 8, 0, 0] },
      metaStrip,
      parties,
      itemsTable,
      totalsTable,
      amountWords,
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 0.5, lineColor: C.line }], margin: [0, 0, 0, 8] },
      footer,
    ],
  };
}

export function generateInvoicePdf(invoice, settings) {
  const docDef = buildDocDefinition(invoice, settings);
  const pdfDoc = printer.createPdfKitDocument(docDef);
  return new Promise((resolve, reject) => {
    const chunks = [];
    pdfDoc.on('data', (c) => chunks.push(c));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

export default generateInvoicePdf;
