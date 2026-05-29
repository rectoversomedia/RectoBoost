import { json, apiError } from "../../../../lib/http.js";
import { getUsdIdrRate, getRateSource } from "../../../../lib/exchangeRate.js";

export async function GET() {
  try {
    // Pre-fetch/refresh the exchange rate
    const rate = await getUsdIdrRate();
    const source = getRateSource();

    return json({
      success: true,
      rate,
      source,
      cached: source === 'cache' || source === 'fallback',
      message: `USD-IDR rate: ${rate} (from ${source})`
    });
  } catch (error) {
    return apiError(error);
  }
}
