import { prisma } from "../../lib/db.js";
import { getUsdIdrRate } from "../../lib/exchangeRate.js";
import { calculateRetailPrice } from "../../lib/pricing.js";
import { getPlatform, groupServicesByPlatform, PLATFORM_META, PLATFORM_ORDER } from "../../lib/categories.js";
import { getProviderServices } from "../../lib/smmwiz.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { platform, search, grouped } = req.query;

    // Try DB cache first
    let dbServices = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 10000,
    });

    // If DB empty, sync live from SMMWIZ
    if (dbServices.length === 0) {
      const usdIdrRate = await getUsdIdrRate();
      const liveServices = await getProviderServices();

      dbServices = liveServices.map((svc) => ({
        providerServiceId: String(svc.service),
        name:              svc.name,
        category:          svc.category,
        type:              svc.type || null,
        min:               Number(svc.min || 0),
        max:               Number(svc.max || 0),
        refill:            Boolean(svc.refill),
        cancel:            Boolean(svc.cancel),
        retailPricePer1k:  calculateRetailPrice(svc.rate, usdIdrRate),
        isActive:          true,
      }));
    }

    // Annotate with platform
    let services = dbServices.map((svc) => ({
      id:               svc.providerServiceId,
      name:             svc.name,
      category:         svc.category,
      platform:         getPlatform(svc.category || ""),
      type:             svc.type,
      min:              svc.min,
      max:              svc.max,
      refill:           svc.refill,
      cancel:           svc.cancel,
      pricePer1k:       svc.retailPricePer1k,
      currency:         "IDR",
    }));

    // Filter by platform
    if (platform && platform !== "all") {
      services = services.filter((s) => s.platform === platform);
    }

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      services = services.filter(
        (s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
      );
    }

    // Grouped response (for sidebar/category nav)
    if (grouped === "1" || grouped === "true") {
      const groups = groupServicesByPlatform(services);
      const platformSummary = PLATFORM_ORDER
        .filter((p) => groups[p]?.length > 0)
        .map((p) => ({
          platform: p,
          label:    PLATFORM_META[p]?.label || p,
          icon:     PLATFORM_META[p]?.icon  || "⭐",
          color:    PLATFORM_META[p]?.color || "#6B7280",
          count:    groups[p].length,
        }));

      return res.status(200).json({
        total:    services.length,
        platforms: platformSummary,
        groups,
      });
    }

    return res.status(200).json({
      total: services.length,
      services,
    });
  } catch (err) {
    console.error("[/api/services]", err);
    return res.status(500).json({ error: err.message });
  }
}
