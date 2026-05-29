# Live Deployment Checklist

Target subdomain: `boost.rectoversomedia.com`

## Recommended Setup

Use managed hosting first so you do not need to maintain a VPS.

- App hosting: Vercel or Railway
- Database: Supabase Postgres or Neon Postgres
- Payment gateway: Xendit or Midtrans
- Domain DNS: your current Rectoverso Media DNS provider

## Step By Step

1. Create a GitHub repository for this project.
2. Push the project to GitHub.
3. Create a Vercel project and connect the GitHub repository.
4. Add environment variables in Vercel:

```bash
SMMWIZ_API_KEY=your_smmwiz_key
SMMWIZ_API_URL=https://smmwiz.com/api/v2
RECTOBOOST_USD_IDR_RATE=16500
RECTOBOOST_PRICE_MULTIPLIER=5
RECTOBOOST_ROUND_TO_IDR=500
RECTOBOOST_MIN_PRICE_PER_1K=1000
PAYMENT_PROVIDER_MODE=duitku
PAYMENT_WEBHOOK_SECRET=your_webhook_secret
DUITKU_ENV=production
DUITKU_MERCHANT_CODE=your_duitku_merchant_code
DUITKU_API_KEY=your_duitku_api_key
DUITKU_DEFAULT_PAYMENT_METHOD=
NEXT_PUBLIC_APP_URL=https://boost.rectoversomedia.com
```

5. Deploy the app.
6. In Vercel, add custom domain:

```text
boost.rectoversomedia.com
```

7. In your DNS provider, create the DNS record Vercel asks for.
8. Add your Duitku callback URL:

```text
https://boost.rectoversomedia.com/api/payment/webhook
```

9. Test service sync, payment creation, and order submission with a small quantity first.

## VPS Alternative

Only use VPS if your dev team can maintain server security, process manager, SSL, and deploy scripts.

Minimum:

- Ubuntu 22.04 or 24.04
- 1 vCPU, 1 GB RAM minimum
- Node.js 20+
- Nginx
- PM2
- SSL via Certbot

For this project, managed hosting is cleaner and faster to go live.
