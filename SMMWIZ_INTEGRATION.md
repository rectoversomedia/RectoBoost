# RectoBoost Production Flow With SMMWIZ

RectoBoost uses SMMWIZ as the service provider only. Customer pricing, wallet balance, invoices, and payment are owned by RectoBoost.

## Main Flow

1. RectoBoost fetches SMMWIZ services from `POST https://smmwiz.com/api/v2`.
2. The backend converts SMMWIZ provider rates into RectoBoost retail prices.
3. The customer sees only RectoBoost retail prices.
4. The customer pays RectoBoost.
5. After payment is confirmed, RectoBoost sends the order to SMMWIZ.
6. RectoBoost stores the SMMWIZ order ID and keeps showing status in the RectoBoost dashboard.

## Environment Variables

```bash
SMMWIZ_API_KEY=your_smmwiz_key
SMMWIZ_API_URL=https://smmwiz.com/api/v2
RECTOBOOST_USD_IDR_RATE=16500
RECTOBOOST_PRICE_MULTIPLIER=5
RECTOBOOST_ROUND_TO_IDR=500
RECTOBOOST_MIN_PRICE_PER_1K=1000
PAYMENT_PROVIDER_MODE=duitku
PAYMENT_WEBHOOK_SECRET=change_this_secret
DUITKU_ENV=sandbox
DUITKU_MERCHANT_CODE=your_duitku_merchant_code
DUITKU_API_KEY=your_duitku_api_key
DUITKU_DEFAULT_PAYMENT_METHOD=
NEXT_PUBLIC_APP_URL=https://boost.rectoversomedia.com
```

## Pricing Formula

The current pricing layer is in `lib/pricing.js`.

```text
provider USD rate per 1K
× internal USD to IDR rate
× RectoBoost price multiplier
→ rounded retail price per 1K
```

Example:

```text
SMMWIZ rate: USD 0.90 / 1K
Internal rate: IDR 16,500
Multiplier: 5x
Retail before rounding: IDR 74,250
Retail after rounding: IDR 74,500 / 1K
```

## Next.js API Routes

| Route | Purpose |
| --- | --- |
| `GET /api/services` | Fetch SMMWIZ services and return RectoBoost retail prices |
| `GET /api/balance` | Read SMMWIZ provider balance and RectoBoost customer balance placeholder |
| `POST /api/payment/create` | Create RectoBoost Duitku payment invoice |
| `POST /api/payment/webhook` | Receive Duitku callback and verify signature |
| `POST /api/orders/checkout` | Send order to SMMWIZ only after payment is paid |
| `POST /api/orders/status` | Refresh SMMWIZ order status |
| `POST /api/refills` | Request refill to SMMWIZ |
| `POST /api/cancel` | Cancel SMMWIZ order where supported |

## What The Dev Team Still Needs For Real Live

- Database for users, orders, payments, wallet ledger, service cache, and provider order IDs.
- Persist Duitku payments and callbacks into the database.
- Authentication and session handling.
- Admin panel to set markup, hide services, override prices, and map categories.
- Scheduled job to refresh SMMWIZ order statuses.
- Webhook endpoint from the payment gateway to mark invoices as paid.
