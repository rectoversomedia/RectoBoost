import { json, apiError } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/auth.js";
import { prisma } from "../../../../lib/db.js";

const DROP_OLD_UNIQUE = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Service_providerServiceId_key'
  ) THEN
    ALTER TABLE "Service" DROP CONSTRAINT "Service_providerServiceId_key";
  END IF;
END$$;
`;

const ADD_COMPOSITE_UNIQUE = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Service_provider_providerServiceId_key'
  ) THEN
    ALTER TABLE "Service" ADD CONSTRAINT "Service_provider_providerServiceId_key" UNIQUE ("provider", "providerServiceId");
  END IF;
END$$;
`;

const PROVIDER_TABLE = `
CREATE TABLE IF NOT EXISTS "Provider" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "apiKey" TEXT NOT NULL,
  "apiUrl" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 1,
  "isHealthy" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Provider_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Provider_name_key" UNIQUE ("name")
);
`;

const PROVIDER_INDEXES = `
CREATE INDEX IF NOT EXISTS "Provider_enabled_idx" ON "Provider"("enabled");
CREATE INDEX IF NOT EXISTS "Provider_priority_idx" ON "Provider"("priority");
`;

const SETTING_TABLE = `
CREATE TABLE IF NOT EXISTS "Setting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
`;

const QUOTE_TABLE = `
CREATE TABLE IF NOT EXISTS "QuoteRequest" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "userId" TEXT,
  "customerEmail" TEXT,
  "customerName" TEXT,
  "customerPhone" TEXT,
  "serviceId" TEXT NOT NULL,
  "serviceName" TEXT NOT NULL,
  "link" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "proposedPrice" INTEGER,
  "finalPrice" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "adminNote" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);
`;

const QUOTE_INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS "QuoteRequest_publicId_key" ON "QuoteRequest"("publicId");
CREATE INDEX IF NOT EXISTS "QuoteRequest_status_createdAt_idx" ON "QuoteRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "QuoteRequest_userId_idx" ON "QuoteRequest"("userId");
`;

const ALL_MIGRATIONS = [
  { name: "drop_old_unique", sql: DROP_OLD_UNIQUE },
  { name: "add_composite_unique", sql: ADD_COMPOSITE_UNIQUE },
  { name: "provider_table", sql: PROVIDER_TABLE },
  { name: "provider_indexes", sql: PROVIDER_INDEXES },
  { name: "setting_table", sql: SETTING_TABLE },
  { name: "quote_table", sql: QUOTE_TABLE },
  { name: "quote_indexes", sql: QUOTE_INDEXES },
];

export async function POST(request) {
  try {
    requireAdmin(request);
    const results = [];
    for (const { name, sql } of ALL_MIGRATIONS) {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push({ name, status: "ok" });
      } catch (e) {
        // Ignore "already exists" errors
        if (e.code === "42P07" || e.code === "42710" || e.message.includes("already exists")) {
          results.push({ name, status: "skipped", reason: "already exists" });
        } else {
          results.push({ name, status: "error", error: e.message });
        }
      }
    }
    return json({ success: true, results });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request) {
  try {
    requireAdmin(request);
    const tables = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('Service', 'Provider', 'Setting', 'QuoteRequest')
    `;
    const constraints = await prisma.$queryRaw`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public."Service"'::regclass
      AND contype = 'u'
    `;
    return json({
      success: true,
      tables,
      uniqueConstraints: constraints,
      message: "POST to this endpoint to run migrations",
    });
  } catch (error) {
    return apiError(error);
  }
}
