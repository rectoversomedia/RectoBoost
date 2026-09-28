import { json, apiError } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/auth.js";
import { prisma } from "../../../../lib/db.js";

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

export async function POST(request) {
  try {
    requireAdmin(request);
    const results = [];
    for (const sql of [SETTING_TABLE, QUOTE_TABLE, QUOTE_INDEXES]) {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push({ sql: sql.slice(0, 50) + "...", status: "ok" });
      } catch (e) {
        results.push({ sql: sql.slice(0, 50) + "...", status: "error", error: e.message });
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
      AND table_name IN ('Setting', 'QuoteRequest')
    `;
    return json({
      success: true,
      tables,
      message: "POST to this endpoint to create missing tables",
    });
  } catch (error) {
    return apiError(error);
  }
}
