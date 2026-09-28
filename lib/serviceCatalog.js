import { prisma } from "./db.js";
import { getUsdIdrRate } from "./exchangeRate.js";
import { calculateRetailPrice, toPublicService } from "./pricing.js";
import { getProviderServices as getSmmwizServices } from "./smmwiz.js";
import { getProviderServices as getYtbotServices } from "./ytbot.js";
import {
  syncProviderServices,
  getAggregateServiceCatalog,
} from "./providers.js";
import { getPricingConfig } from "./pricing.js";

export async function syncSmmwizServices() {
  return syncProviderServices("smmwiz", getSmmwizServices);
}

export async function syncYtbotServices() {
  return syncProviderServices("ytbot", getYtbotServices);
}

export async function syncAllProviders() {
  const results = {};
  const smmwiz = await syncSmmwizServices();
  results.smmwiz = smmwiz;
  try {
    const ytbot = await syncYtbotServices();
    results.ytbot = ytbot;
  } catch (e) {
    results.ytbot = { synced: 0, errors: 1, lastError: e.message };
  }
  return results;
}

export async function listPublicServices() {
  const [catalog, config] = await Promise.all([
    getAggregateServiceCatalog(),
    getPricingConfig(),
  ]);

  return catalog.map((svc) => ({
    provider: svc.provider,
    providerServiceId: svc.providerServiceId,
    name: svc.name,
    type: svc.type,
    category: svc.category,
    min: svc.min,
    max: svc.max,
    refill: svc.refill,
    cancel: svc.cancel,
    retailPricePer1k: svc.retailPricePer1k,
    currency: svc.currency,
    providerCostPer1k: svc.providerCostPer1k,
    markupPercent: svc.markupPercent,
    allProviders: config.showBothPrices ? svc.allProviders : undefined,
  }));
}
