import { envNumber } from "./env.js";
import { getCachedRate } from "./exchangeRate.js";

const defaultUsdIdrRate = envNumber("RECTOBOOST_USD_IDR_RATE", 16500);
const priceMultiplier = envNumber("RECTOBOOST_PRICE_MULTIPLIER", 5);
const roundToIdr = envNumber("RECTOBOOST_ROUND_TO_IDR", 500);
const minimumPricePer1k = envNumber("RECTOBOOST_MIN_PRICE_PER_1K", 1000);

export function calculateRetailPrice(providerRateUsd, usdIdrRate = null) {
  const rate = usdIdrRate || getCachedRate() || defaultUsdIdrRate;
  const providerRate = Number(providerRateUsd || 0);
  const baseIdr = providerRate * rate;
  const markedUp = baseIdr * priceMultiplier;
  const rounded = Math.ceil(markedUp / roundToIdr) * roundToIdr;

  return Math.max(rounded, minimumPricePer1k);
}

export function calculateOrderPricing(service, quantity, usdIdrRate = null) {
  const rate = usdIdrRate || getCachedRate() || defaultUsdIdrRate;
  const qty = Number(quantity || 0);
  const retailPricePer1k = calculateRetailPrice(service.rate, rate);
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
    priceMultiplier,
    markupPercent: Math.round((priceMultiplier - 1) * 100),
    usdIdrRate: rate
  };
}

export function toPublicService(service, usdIdrRate = null) {
  return {
    provider: "smmwiz",
    providerServiceId: service.service,
    name: service.name,
    type: service.type,
    category: service.category,
    min: Number(service.min),
    max: Number(service.max),
    refill: Boolean(service.refill),
    cancel: Boolean(service.cancel),
    retailPricePer1k: calculateRetailPrice(service.rate, usdIdrRate),
    currency: "IDR"
  };
}
