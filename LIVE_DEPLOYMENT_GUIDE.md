# RectoBoost Live Deployment Guide

Recommended setup:

- App hosting: Vercel
- Database: Supabase
- Domain DNS: Niagahoster
- Live URL: `https://boost.rectoversomedia.com`

## 1. Prepare project

Run locally:

```bash
npm run build
npm run db:push
npm run db:seed
```

## 2. Push code to GitHub

Do not upload `.env`.

```bash
git init
git add .
git commit -m "Initial RectoBoost production build"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## 3. Deploy to Vercel

1. Open Vercel.
2. Click `Add New Project`.
3. Import the GitHub repo.
4. Framework preset should be `Next.js`.
5. Build command: `npm run build`.
6. Add environment variables.

Required environment variables:

```env
DATABASE_URL=your_supabase_pooled_database_url
SMMWIZ_API_KEY=your_smmwiz_api_key
SMMWIZ_API_URL=https://smmwiz.com/api/v2
RECTOBOOST_PRICE_MULTIPLIER=5
RECTOBOOST_USD_IDR_RATE=16500
RECTOBOOST_ROUND_TO_IDR=500
RECTOBOOST_MIN_PRICE_PER_1K=1000
PAYMENT_PROVIDER_MODE=manual
SYNC_SECRET=make_a_long_random_secret
NEXT_PUBLIC_APP_URL=https://boost.rectoversomedia.com
```

Keep Duitku variables empty or placeholder while verification is still pending.

## 4. Connect subdomain in Vercel

1. Open the Vercel project.
2. Go to `Settings` -> `Domains`.
3. Add:

```text
boost.rectoversomedia.com
```

Vercel will show the DNS record required. Usually for a subdomain it is:

```text
Type: CNAME
Name: boost
Target: cname.vercel-dns.com
```

## 5. Set DNS in Niagahoster

In Niagahoster DNS Zone:

```text
Type: CNAME
Name/Host: boost
Value/Target: cname.vercel-dns.com
TTL: default
```

Important:

- Delete any old `A`, `AAAA`, or `CNAME` record for `boost` first.
- Do not change root domain records unless you want the main domain to point to Vercel too.
- DNS propagation can take minutes up to 24 hours.

## 6. Sync SMMWIZ services after deploy

After Vercel is live:

```bash
curl -X POST https://boost.rectoversomedia.com/api/services/sync \
  -H "x-sync-secret: YOUR_SYNC_SECRET"
```

Then check Supabase table `Service`.

## 7. Later, after Duitku is approved

Update Vercel environment variables:

```env
PAYMENT_PROVIDER_MODE=duitku
DUITKU_ENV=production
DUITKU_MERCHANT_CODE=your_duitku_merchant_code
DUITKU_API_KEY=your_duitku_api_key
DUITKU_DEFAULT_PAYMENT_METHOD=
```

Set Duitku callback URL:

```text
https://boost.rectoversomedia.com/api/payment/webhook
```
