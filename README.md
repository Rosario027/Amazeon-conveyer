# Amazeon Shopping ERP — OE Belts & Conveyors

Full-stack ERP for **Amazeon Shopping**: GST invoicing (B2B / B2C), purchases with a
document vault, monthly GST Excel reports, and fully customizable invoice settings.

## Modules

| Module | What it does |
| --- | --- |
| **Dashboard** | Month KPIs — sales, B2B/B2C split, GST output vs input, purchases, recent invoices |
| **Invoicing** | B2B/B2C selector, GSTIN validation, Bill To / Ship To, HSN + Part No lines, per-line GST rates, rate-wise CGST/SGST/IGST breakup (intra vs inter-state auto-derived from state codes), auto numbering, PDF download, print, cancel (GST-safe — numbering preserved) |
| **Invoice Settings** | Company block, GSTIN/state, logo & signature upload, invoice title/prefix/next number, payment settings (bank + UPI), terms/footer boilerplate lines, declaration — everything printed is editable |
| **Purchases** | Manual entries and/or uploaded bills (PDF/image/doc ≤10MB) stored **in PostgreSQL** and retrievable any time; month filter & search |
| **Accounts** | Three tabs: **Ledger** (inflow/outflow — invoices in, purchases + referral commissions out, manual expense/income entries incl. **advance payments** tagged with the party), **Commissions** (per-invoice referral commissions + agent-wise totals), **Agents** (register commission agents — name/phone/PAN mandatory; email/bank/remarks optional). Period filter + Excel export (Summary, category breakdown, full Ledger, Commissions sheet) |
| **Reports** | Period picker (defaults to current month) with on-screen GST position + downloadable Excel: Summary, B2B, B2C, Rate-wise, HSN, Documents Issued, Purchases |
| **Admin Config** | Manage login accounts, reset passwords, change own password |

**Phone-first:** a 📱/🖥️ toggle in the topbar switches between Mobile and Desktop
layouts (persisted per device); Mobile gets a drawer sidebar, single-column forms
and scrollable tables — Desktop mode works on phones too (zoomed-out page).

**Referral commissions are internal only** — chosen at the bottom of the invoice
editor (agent + percentage-of-taxable-value or fixed amount), stored with the
invoice, shown in Accounts → Commissions and the Excel export, but **never printed
on the invoice PDF or preview**.

## Logins (seeded)

- `admin1` / `admin123`
- `admin2` / `admin123`

Override via env: `ADMIN1_USER`, `ADMIN1_PASS`, `ADMIN2_USER`, `ADMIN2_PASS`.
Change passwords from **Admin Config** after first login.

## Stack

Single Express service (ESM) serving `/api` + built React (Vite) client.
Prisma + PostgreSQL. PDFs via pdfmake, Excel via exceljs. Zero-dep HMAC auth.

## Deploy on Railway

1. Create a Railway project → **Deploy from GitHub repo** (this repo).
2. Add the **PostgreSQL** plugin — Railway injects `DATABASE_URL` automatically
   (attach it to the service if prompted).
3. Set service variable `AUTH_SECRET` to a long random string.
4. Deploy. Nixpacks runs `npm run build` (prisma generate + client build) then
   `npm run start` (prisma db push → seed → serve). Open the generated domain.

## Local development

```bash
npm install
cp .env.example .env       # point DATABASE_URL at a Postgres instance
npx prisma db push && npm run seed
npm run dev                # server :8080 + Vite client :5173 (proxied /api)
```

Production-style run: `npm run build && npm run start` → http://localhost:8080
