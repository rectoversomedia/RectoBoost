# RectoBoost Production Readiness

Last checked: 2026-05-29

## Current Status

- Frontend is live on `https://boost.rectoversomedia.com`.
- Production API is not live yet. Requests to `/api/auth/login` and `/api/services` return Vercel `NOT_FOUND`.
- Supabase schema and seed scripts are prepared in this repo.
- SMMWIZ integration code is prepared, including service sync and order submission.
- Service retail pricing uses `RECTOBOOST_PRICE_MULTIPLIER`; set it to `5` in production to sell at 5x provider cost.
- Duitku integration code is prepared, but payment mode should stay `manual` until Duitku verification is complete.

## Why Login Fails Right Now

The login page is live, but the backend route `POST /api/auth/login` is not available in production. The test account cannot be checked until Vercel serves the Next.js API routes.

For demo access only, the frontend allows `test@rectoboost.com` / `rectoboost` to continue when the production API is missing. This must be removed or disabled before a real public launch.

## Required Vercel Settings

Open Vercel project `rectoboost`, then check:

- Framework Preset: `Next.js`
- Root Directory: project root, not `public`
- Build Command: `npm run build`
- Install Command: default or `npm ci`
- Output Directory: empty/default, not `public` or `out`
- Redeploy with clear build cache after changing settings

## Required Environment Variables

Set these in Vercel Production:

- `DATABASE_URL`
- `SMMWIZ_API_KEY`
- `SMMWIZ_API_URL=https://smmwiz.com/api/v2`
- `RECTOBOOST_PRICE_MULTIPLIER=5`
- `PAYMENT_PROVIDER_MODE=manual`
- `SYNC_SECRET`
- `NEXT_PUBLIC_APP_URL=https://boost.rectoversomedia.com`

Do not expose these values in screenshots, GitHub, or public docs.

## Production Database Steps

Run once after `DATABASE_URL` points to Supabase production:

```bash
npm run db:push
npm run db:seed
```

Then sync SMMWIZ services:

```bash
curl -X POST https://boost.rectoversomedia.com/api/services/sync \
  -H "x-sync-secret: YOUR_SYNC_SECRET"
```

## Acceptance Checks

- `https://boost.rectoversomedia.com/api/services` returns JSON, not Vercel `NOT_FOUND`.
- `POST https://boost.rectoversomedia.com/api/auth/login` does not return 404.
- Test login works with `test@rectoboost.com` / `rectoboost`.
- Services page shows synced SMMWIZ data.
- Prices shown to users are provider price x `5`.
- New order flow creates local payment first, then creates SMMWIZ order only after payment is marked paid.

## Still Needed Before Real Launch

- Fix Vercel API deployment.
- Seed production database.
- Sync production service catalog.
- Replace demo login fallback with real session-based authentication.
- Finish Duitku merchant verification, then switch payment mode from `manual` to `duitku`.
- Add admin controls for markup, service visibility, and manual payment review.
- Add production monitoring, backup checks, and error logging.
