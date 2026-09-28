import { prisma } from "./db.js";
import { getUsdIdrRate } from "./exchangeRate.js";
import {
  calculateRetailPrice,
  toPublicService,
  getPricingConfig,
} from "./pricing.js";
import { getProviderServices } from "./smmwiz.js";

export async function syncSmmwizServices() {
  const [providerServices, usdIdrRate] = await Promise.all([
    getProviderServices(),
    getUsdIdrRate(),
  ]);

  const synced = [];
  for (const service of providerServices) {
    const retailPricePer1k = await calculateRetailPrice(service.rate, usdIdrRate);
    const saved = await prisma.service.upsert({
      where: { providerServiceId: String(service.service) },
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
        provider: "smmwiz",
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
    synced.push(saved);
  }

  return {
    count: synced.length,
    usdIdrRate,
  };
}

export async function listPublicServices() {
  const [cached, config] = await Promise.all([
    prisma.service.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 10000,
    }),
    getPricingConfig(),
  ]);

  if (cached.length) {
    const usdRate = config.usdIdrRate;
    return cached.map((service) => {
      const result = {
        provider: service.provider,
        providerServiceId: service.providerServiceId,
        name: service.name,
        type: service.type,
        category: service.category,
        min: service.min,
        max: service.max,
        refill: service.refill,
        cancel: service.cancel,
        retailPricePer1k: service.retailPricePer1k,
        currency: "IDR",
      };
      if (config.showBothPrices) {
        result.providerCostPer1k = Math.ceil(
          Number(service.providerRateUsdPer1k || 0) * usdRate
        );
        result.markupPercent = Math.round((config.priceMultiplier - 1) * 100);
      }
      return result;
    });
  }

  const liveRate = await getUsdIdrRate();
  const services = await getProviderServices();
  return Promise.all(services.map((s) => toPublicService(s, liveRate)));
}
