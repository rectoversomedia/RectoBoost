import { prisma } from "./db.js";
import { getUsdIdrRate } from "./exchangeRate.js";
import {
  calculateRetailPrice,
  loadSettings,
  clearSettingsCache,
} from "./pricing.js";

// --- Provider config (DB-backed) ---

const PROVIDER_DEFAULTS = [
  {
    name: "smmwiz",
    apiKey: process.env.SMMWIZ_API_KEY || "",
    apiUrl: process.env.SMMWIZ_API_URL || "https://smmwiz.com/api/v2",
    enabled: true,
    priority: 1,
  },
  {
    name: "ytbot",
    apiKey: process.env.YTBOT_API_KEY || "",
    apiUrl: process.env.YTBOT_API_URL || "https://www.ytbot.com/api/v2",
    enabled: false,
    priority: 2,
  },
];

export async function ensureProvidersExist() {
  for (const defaults of PROVIDER_DEFAULTS) {
    await prisma.provider.upsert({
      where: { name: defaults.name },
      update: {
        apiKey: defaults.apiKey || undefined,
        apiUrl: defaults.apiUrl || undefined,
        enabled: defaults.enabled,
        priority: defaults.priority,
      },
      create: defaults,
    });
  }
}

export async function listProviders() {
  await ensureProvidersExist();
  return prisma.provider.findMany({
    orderBy: { priority: "asc" },
  });
}

export async function updateProvider({ name, enabled, priority, apiKey, apiUrl }) {
  const update = {};
  if (enabled !== undefined) update.enabled = enabled;
  if (priority !== undefined) update.priority = priority;
  if (apiKey !== undefined && apiKey !== "") update.apiKey = apiKey;
  if (apiUrl !== undefined && apiUrl !== "") update.apiUrl = apiUrl;

  return prisma.provider.update({
    where: { name },
    data: update,
  });
}

export async function markProviderHealth(name, healthy, error = null) {
  try {
    await prisma.provider.update({
      where: { name },
      data: {
        isHealthy: healthy,
        lastError: error || null,
        lastSyncAt: healthy ? new Date() : undefined,
      },
    });
  } catch (_) {
    // non-fatal
  }
}

// --- Routing: select best provider per service group ---

function buildServiceKey(service) {
  // Group services by normalized name + category for cross-provider comparison
  return `${service.name.toLowerCase().trim()}__${service.category.toLowerCase().trim()}`;
}

export async function selectBestProviderForOrder(serviceId, providerServiceId) {
  // Get all service rows for this providerServiceId across providers
  const rows = await prisma.service.findMany({
    where: { providerServiceId: String(providerServiceId), isActive: true },
    include: { provider: true },
    orderBy: { retailPricePer1k: "asc" },
  });

  if (!rows.length) return null;

  // Pick cheapest enabled + healthy provider
  for (const row of rows) {
    if (row.provider.enabled && row.provider.isHealthy) {
      return row;
    }
  }

  // Fallback: cheapest enabled even if unhealthy
  const fallback = rows.find((r) => r.provider.enabled);
  return fallback || null;
}

export async function resolveServiceForOrder(providerServiceId, provider) {
  // When ordering, use the exact provider specified
  const row = await prisma.service.findFirst({
    where: { providerServiceId: String(providerServiceId), provider, isActive: true },
  });
  return row;
}

// --- Aggregate service catalog (cheapest per logical service) ---

export async function getAggregateServiceCatalog() {
  const settings = await loadSettings();
  const rate = settings.usdIdrRate;

  const allServices = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  if (!allServices.length) return [];

  // Group by logical service (name + category)
  const groups = new Map();
  for (const svc of allServices) {
    const key = buildServiceKey(svc);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(svc);
  }

  // For each group, pick the cheapest retailPricePer1k row
  // Show all providers' rates in the result for admin visibility
  return Array.from(groups.values()).map((group) => {
    // Sort by retail price asc
    group.sort((a, b) => a.retailPricePer1k - b.retailPricePer1k);
    const best = group[0];
    const providers = group.map((r) => ({
      provider: r.provider,
      retailPricePer1k: r.retailPricePer1k,
      providerRateUsdPer1k: Number(r.providerRateUsdPer1k),
    }));

    return {
      provider: best.provider,
      providerServiceId: best.providerServiceId,
      name: best.name,
      type: best.type,
      category: best.category,
      min: best.min,
      max: best.max,
      refill: best.refill,
      cancel: best.cancel,
      retailPricePer1k: best.retailPricePer1k,
      currency: "IDR",
      // Show cheapest provider cost for transparency
      providerCostPer1k: Math.ceil(Number(best.providerRateUsdPer1k) * rate),
      markupPercent: Math.round((settings.priceMultiplier - 1) * 100),
      // Include all provider options for admin
      allProviders: providers,
    };
  });
}

// --- Sync one provider's services into DB ---

export async function syncProviderServices(providerName, getServicesFn) {
  const settings = await loadSettings();
  const rate = settings.usdIdrRate;
  let synced = 0;
  let errors = 0;
  let lastError = null;

  try {
    const providerServices = await getServicesFn();

    for (const service of providerServices) {
      const retailPricePer1k = await calculateRetailPrice(service.rate, rate);
      try {
        await prisma.service.upsert({
          where: {
            provider_providerServiceId: {
              provider: providerName,
              providerServiceId: String(service.service),
            },
          },
          update: {
            name: service.name,
            category: service.category,
            type: service.type,
            min: Number(service.min || 0),
            max: Number(service.max || 0),
            providerRateUsdPer1k: String(service.rate || 0),
            retailPricePer1k,
            refill: Boolean(service.refill),
            cancel: Boolean(service.cancel),
            isActive: true,
            raw: service,
            syncedAt: new Date(),
          },
          create: {
            provider: providerName,
            providerServiceId: String(service.service),
            name: service.name,
            category: service.category,
            type: service.type,
            min: Number(service.min || 0),
            max: Number(service.max || 0),
            providerRateUsdPer1k: String(service.rate || 0),
            retailPricePer1k,
            refill: Boolean(service.refill),
            cancel: Boolean(service.cancel),
            isActive: true,
            raw: service,
          },
        });
        synced++;
      } catch (e) {
        errors++;
        lastError = e.message;
      }
    }

    await markProviderHealth(providerName, true);
    return { synced, errors, lastError };
  } catch (e) {
    await markProviderHealth(providerName, false, e.message);
    return { synced: 0, errors: 1, lastError: e.message };
  }
}
