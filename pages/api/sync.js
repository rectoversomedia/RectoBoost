/**
 * POST /api/sync — trigger full SMMWIZ → DB service sync.
 * Should be called from a cron job or admin panel.
 * Protected by SYNC_SECRET env var (set it in .env).
 */

import { syncSmmwizServices } from "../../lib/serviceCatalog.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.SYNC_SECRET || "";
  const authHeader = req.headers["x-sync-secret"] || "";

  if (secret && authHeader !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await syncSmmwizServices();
    return res.status(200).json({
      ok:          true,
      synced:      result.count,
      usdIdrRate:  result.usdIdrRate,
      syncedAt:    new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/sync]", err);
    return res.status(500).json({ error: err.message });
  }
}
