import { envNumber } from "./env.js";
import { getCachedRate } from "./exchangeRate.js";
import { prisma } from "./db.js";

const defaultUsdIdrRate = envNumber("RECTOBOOST_USD_IDR_RATE", 19000);
const defaultMultiplier = envNumber("RECTOBOOST_PRICE_MULTIPLIER", 5);
const defaultMinPrice = envNumber("RECTOBOOST_MIN_PRICE_PER_1K", 1000);

// Settings cache (in-memory, refresh every 60s)
let settingsCache = null;
let settingsCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000;

async function loadSettings() {
  const now = Date.now();
  if (settingsCache && now - settingsCacheTime < CACHE_TTL_MS) {
    return settingsCache;
  }
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ["usd_idr_rate", "price_multiplier", "min_price_per_1k", "show_both_prices"] } }
    });
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    settingsCache = {
      usdIdrRate: Number(map.usd_idr_rate ?? defaultUsdIdrRate),
      priceMultiplier: Number(map.price_multiplier ?? defaultMultiplier),
      minPricePer1k: Number(map.min_price_per_1k ?? defaultMinPrice),
      showBothPrices: Boolean(map.show_both_prices ?? true),
    };
    settingsCacheTime = now;
    return settingsCache;
  } catch (e) {
    // Fallback to env defaults if DB unavailable
    return {
      usdIdrRate: defaultUsdIdrRate,
      priceMultiplier: defaultMultiplier,
      minPricePer1k: defaultMinPrice,
      showBothPrices: true,
    };
  }
}

export function clearSettingsCache() {
  settingsCache = null;
  settingsCacheTime = 0;
}

function smartRound(value) {
  // Round to nearest "nice" number
  if (value < 100) {
    return Math.ceil(value / 50) * 50;       // <100 → 50 increments
  } else if (value < 1000) {
    return Math.ceil(value / 100) * 100;     // <1000 → 100 increments
  } else if (value < 10000) {
    return Math.ceil(value / 500) * 500;     // <10k → 500 increments
  } else if (value < 100000) {
    return Math.ceil(value / 1000) * 1000;   // <100k → 1k increments
  } else if (value < 1000000) {
    return Math.ceil(value / 5000) * 5000;   // <1M → 5k increments
  } else {
    return Math.ceil(value / 10000) * 10000; // ≥1M → 10k increments
  }
}

export async function calculateRetailPrice(providerRateUsd, usdIdrRate = null) {
  const settings = await loadSettings();
  const rate = usdIdrRate || settings.usdIdrRate || defaultUsdIdrRate;
  const providerRate = Number(providerRateUsd || 0);
  const baseIdr = providerRate * rate;
  const markedUp = baseIdr * settings.priceMultiplier;
  const rounded = smartRound(markedUp);

  return Math.max(rounded, settings.minPricePer1k);
}

export async function calculateOrderPricing(service, quantity, usdIdrRate = null) {
  const settings = await loadSettings();
  const rate = usdIdrRate || settings.usdIdrRate || defaultUsdIdrRate;
  const qty = Number(quantity || 0);
  const retailPricePer1k = await calculateRetailPrice(service.rate, rate);
  const providerCostIdr = (Number(service.rate || 0) * rate * qty) / 1000;
  const customerPriceIdr = Math.ceil((retailPricePer1k * qty) / 1000);

  return {
    currency: "IDR",
    quantity: qty,
    providerRateUsdPer1k: Number(service.rate || 0),
    providerCostIdr: Math.ceil(providerCostIdr),
    retailPricePer1k,
    customerPriceIdr,
    profitIdr: Math.max(0, customerPriceIdr - Math.ceil(providerCostIdr)),
    priceMultiplier: settings.priceMultiplier,
    markupPercent: Math.round((settings.priceMultiplier - 1) * 100),
    usdIdrRate: rate,
    providerCostPer1k: Math.ceil(providerRateIdr(Number(service.rate || 0), rate)),
  };
}

function providerRateIdr(rate, idrRate) {
  return rate * idrRate;
}

export async function toPublicService(service, usdIdrRate = null) {
  const settings = await loadSettings();
  const rate = usdIdrRate || settings.usdIdrRate || defaultUsdIdrRate;
  const providerRate = Number(service.rate || 0);
  const providerCostPer1k = Math.ceil(providerRateIdr(providerRate, rate));
  const retailPricePer1k = await calculateRetailPrice(providerRate, rate);

  const result = {
    provider: "smmwiz",
    providerServiceId: service.service,
    name: service.name,
    type: service.type,
    category: service.category,
    min: Number(service.min),
    max: Number(service.max),
    refill: Boolean(service.refill),
    cancel: Boolean(service.cancel),
    retailPricePer1k,
    currency: "IDR"
  };

  // Optionally show provider cost (for admin / transparency)
  if (settings.showBothPrices) {
    result.providerCostPer1k = providerCostPer1k;
    result.markupPercent = Math.round((settings.priceMultiplier - 1) * 100);
  }

  return result;
}

export async function getPricingConfig() {
  const settings = await loadSettings();
  return {
    usdIdrRate: settings.usdIdrRate,
    priceMultiplier: settings.priceMultiplier,
    minPricePer1k: settings.minPricePer1k,
    showBothPrices: settings.showBothPrices,
  };
}

export async function updatePricingConfig({
  usdIdrRate,
  priceMultiplier,
  minPricePer1k,
  showBothPrices,
}) {
  const updates = [];
  if (usdIdrRate !== undefined) {
    updates.push(prisma.setting.upsert({
      where: { key: "usd_idr_rate" },
      update: { value: Number(usdIdrRate) },
      create: { key: "usd_idr_rate", value: Number(usdIdrRate) },
    }));
  }
  if (priceMultiplier !== undefined) {
    updates.push(prisma.setting.upsert({
      where: { key: "price_multiplier" },
      update: { value: Number(priceMultiplier) },
      create: { key: "price_multiplier", value: Number(priceMultiplier) },
    }));
  }
  if (minPricePer1k !== undefined) {
    updates.push(prisma.setting.upsert({
      where: { key: "min_price_per_1k" },
      update: { value: Number(minPricePer1k) },
      create: { key: "min_price_per_1k", value: Number(minPricePer1k) },
    }));
  }
  if (showBothPrices !== undefined) {
    updates.push(prisma.setting.upsert({
      where: { key: "show_both_prices" },
      update: { value: Boolean(showBothPrices) },
      create: { key: "show_both_prices", value: Boolean(showBothPrices) },
    }));
  }
  await prisma.$transaction(updates);
  clearSettingsCache();
  return getPricingConfig();
}
