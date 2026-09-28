import { json, apiError } from "../../../lib/http.js";
import { requireAdmin } from "../../../lib/auth.js";
import {
  getPricingConfig,
  updatePricingConfig,
} from "../../../lib/pricing.js";

export async function GET(request) {
  try {
    requireAdmin(request);
    const config = await getPricingConfig();
    return json({ success: true, config });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request) {
  try {
    requireAdmin(request);
    const body = await request.json();
    const { usdIdrRate, priceMultiplier, minPricePer1k, showBothPrices } = body;

    if (usdIdrRate !== undefined && (Number(usdIdrRate) < 1000 || Number(usdIdrRate) > 50000)) {
      return apiError(new Error("USD-IDR rate harus antara 1000 dan 50000"), 400);
    }
    if (priceMultiplier !== undefined && (Number(priceMultiplier) < 1 || Number(priceMultiplier) > 50)) {
      return apiError(new Error("Multiplier harus antara 1 dan 50"), 400);
    }
    if (minPricePer1k !== undefined && Number(minPricePer1k) < 0) {
      return apiError(new Error("Min price tidak boleh negatif"), 400);
    }

    const config = await updatePricingConfig({
      usdIdrRate,
      priceMultiplier,
      minPricePer1k,
      showBothPrices,
    });

    return json({ success: true, config });
  } catch (error) {
    return apiError(error);
  }
}
