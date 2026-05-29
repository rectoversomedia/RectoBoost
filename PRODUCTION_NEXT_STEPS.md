# RectoBoost Production Next Steps

## 1. Push database schema

Run this once after `DATABASE_URL` is filled with the Supabase pooled connection string:

```bash
npm run db:push
```

## 2. Create testing account

```bash
npm run db:seed
```

Testing login:

- Email: `test@rectoboost.com`
- Password: `rectoboost`

## 3. Sync SMMWIZ services into Supabase

Start the app first:

```bash
npm run dev
```

Then in a second terminal:

```bash
curl -X POST http://localhost:3000/api/services/sync
```

Check Supabase tables after this:

- `User`
- `Wallet`
- `Service`
- `Notification`

## 4. Test the live-like flow

Open:

```text
http://localhost:3000
```

Expected flow:

1. Login with the testing account.
2. Open `New Order`.
3. Choose a service.
4. Change quantity.
5. Continue to payment.
6. In manual mode, payment is treated as paid for testing.
7. Checkout sends the order to SMMWIZ only after payment status is `PAID`.

## 5. Duitku later

Keep `PAYMENT_PROVIDER_MODE=manual` while Duitku is still under verification.

After Duitku is approved:

```env
PAYMENT_PROVIDER_MODE=duitku
DUITKU_ENV=production
DUITKU_MERCHANT_CODE=...
DUITKU_API_KEY=...
NEXT_PUBLIC_APP_URL=https://boost.rectoversomedia.com
```

Then set this callback URL in Duitku:

```text
https://boost.rectoversomedia.com/api/payment/webhook
```

## Current production guardrails

- SMMWIZ service prices are converted from USD to IDR and multiplied by `RECTOBOOST_PRICE_MULTIPLIER`.
- Default multiplier is `5`.
- Payment records are saved to database.
- Orders are rejected if payment is not `PAID`.
- Duitku webhook can update payment status and trigger the SMMWIZ order after payment is paid.
