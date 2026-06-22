import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Store for loaded state
let _envLoaded = false;

/**
 * Load environment variables from .env file.
 * Only sets variables that are not already defined (allows env override).
 * Idempotent - safe to call multiple times.
 *
 * Works in both server.js, CLI scripts, and Next.js serverless functions.
 */
export function loadEnv(envPath = null) {
  if (_envLoaded) return; // Already loaded, skip

  const path = envPath || join(process.cwd(), ".env");
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }

  _envLoaded = true;
}

/**
 * Parse a numeric environment variable with fallback.
 */
export function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Require an environment variable to be set, throw otherwise.
 */
export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
