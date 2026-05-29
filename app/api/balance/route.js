import { json, apiError } from "../../../lib/http.js";
import { getProviderBalance } from "../../../lib/smmwiz.js";

export async function GET() {
  try {
    const providerBalance = await getProviderBalance();
    return json({
      provider: "smmwiz",
      providerBalance,
      customerBalance: {
        currency: "IDR",
        amount: 2475000
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
