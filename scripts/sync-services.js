#!/usr/bin/env node
/**
 * Sync all SMMWIZ services into Supabase.
 * Run: node scripts/sync-services.js
 *
 * Uses the real SMMWIZ_API_KEY from .env.
 * Applies RectoBoost pricing markup and platform categorization.
 * Safe to run multiple times (upsert by providerServiceId).
 */

import { loadEnv } from "../lib/env.js";

// Load env first before any other imports
loadEnv();

// Now import modules that need env vars
const { PrismaClient } = await import("@prisma/client");
const { getPlatform } = await import("../lib/categories.js");

const prisma = new PrismaClient();

const SMMWIZ_API_URL = process.env.SMMWIZ_API_URL || "https://smmwiz.com/api/v2";
const SMMWIZ_API_KEY = process.env.SMMWIZ_API_KEY || "";

const USD_IDR_RATE   = Number(process.env.RECTOBOOST_USD_IDR_RATE   || 16500);
const MULTIPLIER     = Number(process.env.RECTOBOOST_PRICE_MULTIPLIER || 5);
const ROUND_TO       = Number(process.env.RECTOBOOST_ROUND_TO_IDR    || 500);
const MIN_PRICE      = Number(process.env.RECTOBOOST_MIN_PRICE_PER_1K || 1000);

function calcRetailPrice(rateUsd) {
  const base    = Number(rateUsd || 0) * USD_IDR_RATE;
  const markedup = base * MULTIPLIER;
  const rounded  = Math.ceil(markedup / ROUND_TO) * ROUND_TO;
  return Math.max(rounded, MIN_PRICE);
}

async function fetchSmmwizServices() {
  const params = new URLSearchParams({ key: SMMWIZ_API_KEY, action: "services" });
  const res = await fetch(SMMWIZ_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("SMMWIZ returned non-JSON: " + text.slice(0, 200));
  }
}

// INT4 max — some SMMWIZ services have absurd max values like 825 billion
const INT4_MAX = 2_147_483_647;
function safeInt(val) {
  const n = Number(val || 0);
  return Math.min(Math.max(Math.round(n), 0), INT4_MAX);
}

// Decimal(12,6) max — absolute value < 10^6
const DECIMAL_MAX = 999999.999999;
function safeRate(val) {
  const n = Number(val || 0);
  return Math.min(Math.max(n, 0), DECIMAL_MAX).toFixed(6);
}

async function main() {
  if (!SMMWIZ_API_KEY) {
    console.error("ERROR: SMMWIZ_API_KEY is not set in .env");
    process.exit(1);
  }

  console.log("Fetching services from SMMWIZ...");
  const services = await fetchSmmwizServices();

  if (!Array.isArray(services)) {
    console.error("Unexpected response:", services);
    process.exit(1);
  }

  console.log(`Got ${services.length} services. Syncing to DB...`);

  const platformCount = {};
  let synced = 0;
  let failed = 0;

  for (const svc of services) {
    try {
      const retailPricePer1k = calcRetailPrice(svc.rate);
      const platform = getPlatform(svc.category || "");

      platformCount[platform] = (platformCount[platform] || 0) + 1;

      await prisma.service.upsert({
        where: { providerServiceId: String(svc.service) },
        update: {
          name:                 svc.name,
          category:             svc.category,
          type:                 svc.type || null,
          min:                  safeInt(svc.min),
          max:                  safeInt(svc.max),
          providerRateUsdPer1k: safeRate(svc.rate),
          retailPricePer1k:     safeInt(retailPricePer1k),
          refill:               Boolean(svc.refill),
          cancel:               Boolean(svc.cancel),
          isActive:             true,
          raw:                  svc,
          syncedAt:             new Date(),
        },
        create: {
          provider:             "smmwiz",
          providerServiceId:    String(svc.service),
          name:                 svc.name,
          category:             svc.category,
          type:                 svc.type || null,
          min:                  safeInt(svc.min),
          max:                  safeInt(svc.max),
          providerRateUsdPer1k: safeRate(svc.rate),
          retailPricePer1k:     safeInt(retailPricePer1k),
          refill:               Boolean(svc.refill),
          cancel:               Boolean(svc.cancel),
          isActive:             true,
          raw:                  svc,
        },
      });
      synced++;
    } catch (err) {
      console.warn(`  SKIP service ${svc.service}: ${err.message}`);
      failed++;
    }
  }

  console.log("\n=== SYNC COMPLETE ===");
  console.log(`Synced : ${synced}`);
  console.log(`Failed : ${failed}`);
  console.log(`\nBy platform:`);
  const sorted = Object.entries(platformCount).sort((a, b) => b[1] - a[1]);
  for (const [platform, count] of sorted) {
    console.log(`  ${platform.padEnd(20)} ${count}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
