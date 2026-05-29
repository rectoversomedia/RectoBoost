# RectoBoost Database Setup

Database layer sudah disiapkan dengan Prisma + PostgreSQL.

## Yang Sudah Ada

- `prisma/schema.prisma`
- `lib/db.js`
- Script database di `package.json`

## Recommended Database

Pakai Supabase Postgres untuk live.

## Step Dari VS Code Terminal

1. Install dependency Prisma:

```bash
npm install
```

2. Isi `DATABASE_URL` di `.env`.

Untuk Supabase, ambil connection string dari:

```text
Supabase Project > Project Settings > Database > Connection string
```

Formatnya kurang lebih:

```bash
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres?schema=public"
```

3. Generate Prisma client:

```bash
npm run db:generate
```

4. Push schema ke database:

```bash
npm run db:push
```

5. Buka database browser lokal:

```bash
npm run db:studio
```

## Tabel Utama

- `User`
- `Wallet`
- `WalletTransaction`
- `Service`
- `Payment`
- `Order`
- `Ticket`
- `Notification`

## Production Flow

1. Sync service dari SMMWIZ ke tabel `Service`.
2. User top up balance lewat payment gateway.
3. Payment sukses masuk ke `Payment` dan `WalletTransaction`.
4. User order memakai wallet balance.
5. Setelah payment/order valid, backend kirim order ke SMMWIZ.
6. Simpan SMMWIZ order ID di tabel `Order`.
7. Status order di-refresh dari SMMWIZ.
