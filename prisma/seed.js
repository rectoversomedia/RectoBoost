#!/usr/bin/env node
/**
 * Seed production database.
 * Creates the RectoBoost admin account + a default customer.
 * Safe to run multiple times (upsert by email).
 *
 * Run: node prisma/seed.js
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const { PrismaClient } = await import("@prisma/client");
const { hashPassword  } = await import("../lib/password.js");

const prisma = new PrismaClient();

// Read admin password from env, fallback to a strong default
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || "admin@rectoboost.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RectoBoost@2026!";
const ADMIN_NAME     = process.env.ADMIN_NAME     || "Admin RectoBoost";

async function upsertUser({ email, password, fullName, username, role }) {
  const passwordHash = hashPassword(password);

  const user = await prisma.user.upsert({
    where:  { email },
    update: { fullName, username, role, isActive: true },
    create: { email, passwordHash, fullName, username, role, isActive: true },
  });

  // Ensure wallet exists
  await prisma.wallet.upsert({
    where:  { userId: user.id },
    update: {},
    create: { userId: user.id, balance: 0, currency: "IDR" },
  });

  return user;
}

async function main() {
  console.log("Seeding RectoBoost database...\n");

  // Admin account
  const admin = await upsertUser({
    email:    ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    fullName: ADMIN_NAME,
    username: "admin",
    role:     "ADMIN",
  });
  console.log(`✓ Admin : ${admin.email}`);

  // Default member account for testing
  const member = await upsertUser({
    email:    "member@rectoboost.com",
    password: "Member@2026!",
    fullName: "Member Demo",
    username: "member",
    role:     "MEMBER",
  });
  console.log(`✓ Member: ${member.email}`);

  console.log("\nDone. Login credentials:");
  console.log(`  Admin  → ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Member → member@rectoboost.com / Member@2026!`);
  console.log("\nNEXT: run 'node scripts/sync-services.js' to pull all SMMWIZ services.");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
