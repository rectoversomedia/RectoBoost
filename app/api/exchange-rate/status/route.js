import { json, apiError } from "../../../../lib/http.js";
import { getCachedRate, getRateSource } from "../../../../lib/exchangeRate.js";

export async function GET() {
  try {
    const rate = getCachedRate();
    const source = getRateSource();

    return json({
      success: true,
      rate,
      source,
      message: `Current USD-IDR rate: ${rate} (from ${source})`
    });
  } catch (error) {
    return apiError(error);
  }
}
