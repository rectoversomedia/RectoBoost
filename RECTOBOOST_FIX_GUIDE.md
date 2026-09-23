# RectoBoost — Emergency Fix & Production Deployment Guide

**Last updated:** 2026-09-22

---

## ROOT CAUSE — Why It's Broken

The codebase uses **Tripay** for payments. `.env.example` had the wrong variables (`DUITKU_*` instead of `TRIPAY_*`), and critical variables like `JWT_SECRET` were missing.

---

## QUICK FIX — 30 Second Checklist

If you just want things working:

1. [ ] Set ALL env vars in Vercel Dashboard (see Step 2 below)
2. [ ] Push schema to Supabase (`npx prisma db push`)
3. [ ] Run seed + sync (`npm run db:seed && npm run services:sync`)
4. [ ] Set Tripay callback URL

---

## STEP 1 — Get Tripay Credentials

1. Go to [tripay.co.id/merchant](https://tripay.co.id/merchant) → Login
2. Settings → API Key
3. Copy: **API Key**, **Private Key**, **Merchant Code**
4. Settings → Callback URL → Set to: `https://boost.rectoversomedia.com/api/payment/webhook`

---

## STEP 2 — Vercel Environment Variables

**Go to:** Vercel Dashboard → rectoboost → Settings → Environment Variables

Set for **Production**, **Preview**, and **Development**:

| Name | Value | Note |
|------|-------|------|
| `DATABASE_URL` | `postgresql://postgres:SabrinaBaby1992!@db.zvniuvrxgboubaegbclt.supabase.co:5432/postgres?pgbouncer=true` | |
| `DIRECT_URL` | `postgresql://postgres:SabrinaBaby1992!@db.zvniuvrxgboubaegbclt.supabase.co:5432/postgres` | For Prisma migrations |
| `JWT_SECRET` | *(generate below)* | Auth signing key |
| `SYNC_SECRET` | *(generate below)* | Sync endpoint security |
| `SMMWIZ_API_KEY` | `4acce9a49d0fd6ed2865ec099bccd84e` | |
| `SMMWIZ_API_URL` | `https://smmwiz.com/api/v2` | |
| `TRIPAY_API_KEY` | *(from Tripay dashboard)* | |
| `TRIPAY_PRIVATE_KEY` | *(from Tripay dashboard)* | **Critical for webhook** |
| `TRIPAY_MERCHANT_CODE` | *(from Tripay dashboard)* | |
| `RECTOBOOST_USD_IDR_RATE` | `16500` | |
| `RECTOBOOST_PRICE_MULTIPLIER` | `5` | |
| `RECTOBOOST_ROUND_TO_IDR` | `500` | |
| `RECTOBOOST_MIN_PRICE_PER_1K` | `1000` | |
| `NEXT_PUBLIC_APP_URL` | `https://boost.rectoversomedia.com` | |
| `NODE_ENV` | `production` | |

**Generate secrets locally:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# → paste as JWT_SECRET

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → paste as SYNC_SECRET
```

---

## STEP 3 — Push Schema to Supabase

### Option A: Prisma CLI (Recommended)

```bash
# 1. Clone/pull latest code
git pull

# 2. Install
npm install

# 3. Create .env (for local runs)
cp .env.example .env
# Edit .env with your values

# 4. Push schema
npx prisma db push --accept-data-loss
```

### Option B: Manual SQL (if Prisma fails)

Run this in **Supabase → SQL Editor**:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS "User" (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  fullName     TEXT NOT NULL,
  username     TEXT UNIQUE,
  phone        TEXT,
  role         TEXT NOT NULL DEFAULT 'MEMBER',
  isActive     BOOLEAN NOT NULL DEFAULT true,
  createdAt    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wallet
CREATE TABLE IF NOT EXISTS "Wallet" (
  id        TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  userId    TEXT UNIQUE NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  balance   INTEGER NOT NULL DEFAULT 0,
  currency  TEXT NOT NULL DEFAULT 'IDR',
  createdAt TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WalletTransaction
CREATE TABLE IF NOT EXISTS "WalletTransaction" (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  userId       TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('TOPUP','ORDER_PAYMENT','REFUND','ADJUSTMENT')),
  status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','FAILED','CANCELED')),
  amount       INTEGER NOT NULL,
  balanceAfter INTEGER,
  currency     TEXT NOT NULL DEFAULT 'IDR',
  reference    TEXT,
  note         TEXT,
  metadata     JSONB,
  createdAt    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"(userId, createdAt);
CREATE INDEX IF NOT EXISTS "WalletTransaction_reference_idx" ON "WalletTransaction"(reference);

-- Service
CREATE TABLE IF NOT EXISTS "Service" (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  provider             TEXT NOT NULL DEFAULT 'smmwiz',
  providerServiceId    TEXT UNIQUE NOT NULL,
  name                 TEXT NOT NULL,
  category             TEXT NOT NULL,
  type                 TEXT,
  min                  INTEGER NOT NULL,
  max                  INTEGER NOT NULL,
  providerRateUsdPer1k NUMERIC(12,6) NOT NULL DEFAULT 0,
  retailPricePer1k     INTEGER NOT NULL,
  refill               BOOLEAN NOT NULL DEFAULT false,
  cancel               BOOLEAN NOT NULL DEFAULT false,
  isActive             BOOLEAN NOT NULL DEFAULT true,
  raw                  JSONB,
  syncedAt             TIMESTAMPTZ NOT NULL DEFAULT now(),
  createdAt            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Service_category_idx" ON "Service"(category);
CREATE INDEX IF NOT EXISTS "Service_isActive_idx" ON "Service"(isActive);

-- Payment
CREATE TABLE IF NOT EXISTS "Payment" (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  userId             TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL DEFAULT 'manual',
  providerPaymentId  TEXT,
  status             TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','FAILED','EXPIRED','REFUNDED')),
  amount             INTEGER NOT NULL,
  fee                INTEGER NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'IDR',
  method             TEXT NOT NULL,
  invoiceUrl         TEXT,
  paidAt             TIMESTAMPTZ,
  expiredAt          TIMESTAMPTZ,
  metadata           JSONB,
  createdAt          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Payment_userId_createdAt_idx" ON "Payment"(userId, createdAt);
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"(status);
CREATE INDEX IF NOT EXISTS "Payment_providerPaymentId_idx" ON "Payment"(providerPaymentId);

-- Order
CREATE TABLE IF NOT EXISTS "Order" (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  publicId          TEXT UNIQUE NOT NULL,
  userId            TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  serviceId         TEXT NOT NULL REFERENCES "Service"(id),
  paymentId         TEXT REFERENCES "Payment"(id),
  provider          TEXT NOT NULL DEFAULT 'smmwiz',
  providerOrderId   TEXT,
  link              TEXT NOT NULL,
  quantity          INTEGER NOT NULL,
  charge            INTEGER NOT NULL,
  providerCostIdr   INTEGER,
  profitIdr         INTEGER,
  startCount        INTEGER,
  remains           INTEGER,
  status            TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','IN_PROGRESS','PARTIAL','COMPLETED','CANCELED','FAILED')),
  rawStatus         TEXT,
  note              TEXT,
  createdAt         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"(userId, createdAt);
CREATE INDEX IF NOT EXISTS "Order_providerOrderId_idx" ON "Order"(providerOrderId);
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"(status);

-- Ticket
CREATE TABLE IF NOT EXISTS "Ticket" (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  publicId    TEXT UNIQUE NOT NULL,
  userId      TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  orderId     TEXT REFERENCES "Order"(id),
  subject     TEXT NOT NULL,
  category    TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH')),
  status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  messages    JSONB,
  createdAt   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updatedAt   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Ticket_userId_createdAt_idx" ON "Ticket"(userId, createdAt);
CREATE INDEX IF NOT EXISTS "Ticket_status_idx" ON "Ticket"(status);

-- Notification
CREATE TABLE IF NOT EXISTS "Notification" (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  userId     TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info',
  isRead     BOOLEAN NOT NULL DEFAULT false,
  metadata   JSONB,
  createdAt  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_createdAt_idx" ON "Notification"(userId, isRead, createdAt);

-- PasswordReset
CREATE TABLE IF NOT EXISTS "PasswordReset" (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  userId     TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  expiresAt  TIMESTAMPTZ NOT NULL,
  usedAt     TIMESTAMPTZ,
  createdAt  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "PasswordReset_token_idx" ON "PasswordReset"(token);
CREATE INDEX IF NOT EXISTS "PasswordReset_userId_idx" ON "PasswordReset"(userId);
```

---

## STEP 4 — Create Admin Account

```bash
# Method A: Use the seed script (recommended)
ADMIN_EMAIL=admin@rectoversomedia.com \
ADMIN_PASSWORD=SabrinaBaby1992! \
  node prisma/seed.js

# Method B: Generate password hash manually, then insert
node -e "
const crypto = require('crypto');
const pw = 'SabrinaBaby1992!';
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync(pw, salt, 100000, 64, 'sha512').toString('hex');
console.log('pbkdf2:100000:' + salt + ':' + hash);
"
```

Then run in Supabase SQL Editor:
```sql
INSERT INTO "User" (email, passwordHash, fullName, username, role, isActive)
VALUES (
  'admin@rectoversomedia.com',
  'pbkdf2:100000:SALT_FROM_ABOVE:HASH_FROM_ABOVE',
  'Admin RectoBoost',
  'admin',
  'ADMIN',
  true
) ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', isActive = true;
```

---

## STEP 5 — Sync Services from SMMWIZ

```bash
# Create .env first
cp .env.example .env
# Fill in: DATABASE_URL, SMMWIZ_API_KEY, RECTOBOOST_* vars

# Run sync
npm run services:sync
```

Or via HTTP:
```bash
curl -X POST https://boost.rectoversomedia.com/api/sync \
  -H "x-sync-secret: YOUR_SYNC_SECRET"
```

---

## STEP 6 — Tripay Callback

In **Tripay Dashboard**:
- Settings → Callback URL
- Set: `https://boost.rectoversomedia.com/api/payment/webhook`

---

## TROUBLESHOOTING

### "Invalid signature" on payment webhook
→ `TRIPAY_PRIVATE_KEY` not set in Vercel env vars

### "JWT_SECRET environment variable is not set"
→ Missing `JWT_SECRET` in Vercel env vars

### Dashboard shows no services
→ Run `npm run services:sync` to populate the Service table

### "SMMWIZ request failed"
→ `SMMWIZ_API_KEY` not set or invalid

### Database connection error in Vercel Functions
→ Add `DIRECT_URL` env var (needed for Prisma connection pooler)

### 500 on all pages
→ Check Vercel deployment logs, ensure all env vars are set, then **redeploy**

---

## Complete Environment Variable Reference

| Variable | Required | Default |
|----------|----------|---------|
| `DATABASE_URL` | ✅ Yes | Supabase pooled connection |
| `DIRECT_URL` | ✅ Yes | Supabase direct connection |
| `JWT_SECRET` | ✅ Yes | 64-char hex string |
| `SMMWIZ_API_KEY` | ✅ Yes | `4acce9a49d0fd6ed2865ec099bccd84e` |
| `SMMWIZ_API_URL` | No | `https://smmwiz.com/api/v2` |
| `TRIPAY_API_KEY` | ✅ Yes | From Tripay dashboard |
| `TRIPAY_PRIVATE_KEY` | ✅ Yes | From Tripay dashboard |
| `TRIPAY_MERCHANT_CODE` | ✅ Yes | From Tripay dashboard |
| `RECTOBOOST_USD_IDR_RATE` | No | `16500` |
| `RECTOBOOST_PRICE_MULTIPLIER` | No | `5` |
| `RECTOBOOST_ROUND_TO_IDR` | No | `500` |
| `RECTOBOOST_MIN_PRICE_PER_1K` | No | `1000` |
| `SYNC_SECRET` | No | Random hex string |
| `NEXT_PUBLIC_APP_URL` | ✅ Yes | `https://boost.rectoversomedia.com` |
| `NODE_ENV` | No | `production` |
| `SMTP_HOST` | No | SMTP server |
| `SMTP_PORT` | No | `465` |
| `SMTP_USER` | No | Email address |
| `SMTP_PASS` | No | App password |
| `MAIL_FROM` | No | From email address |
| `GOOGLE_CLIENT_ID` | No | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth |
