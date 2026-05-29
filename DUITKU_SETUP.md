# Duitku POP Setup

RectoBoost memakai Duitku POP untuk membuat invoice pembayaran. Dokumentasi resmi:

```text
https://docs.duitku.com/pop/id/
```

## Environment

Untuk local sandbox:

```bash
PAYMENT_PROVIDER_MODE=duitku
DUITKU_ENV=sandbox
DUITKU_MERCHANT_CODE=your_sandbox_merchant_code
DUITKU_API_KEY=your_sandbox_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Untuk live:

```bash
PAYMENT_PROVIDER_MODE=duitku
DUITKU_ENV=production
DUITKU_MERCHANT_CODE=your_live_merchant_code
DUITKU_API_KEY=your_live_api_key
NEXT_PUBLIC_APP_URL=https://boost.rectoversomedia.com
```

## Routes

- `POST /api/payment/create`
  Membuat Duitku invoice dan mengembalikan `paymentUrl`.

- `POST /api/payment/webhook`
  Menerima callback Duitku dan memvalidasi signature.

## Live Callback URL

Pasang di dashboard Duitku:

```text
https://boost.rectoversomedia.com/api/payment/webhook
```

## Important Flow

1. Customer membuat payment invoice di RectoBoost.
2. Customer membayar lewat Duitku.
3. Duitku mengirim callback ke RectoBoost.
4. RectoBoost menandai payment sebagai paid.
5. Baru setelah paid, RectoBoost mengirim order ke SMMWIZ.
