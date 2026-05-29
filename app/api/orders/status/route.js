import { json, apiError } from "../../../../lib/http.js";
import { getProviderOrderStatus } from "../../../../lib/smmwiz.js";

export async function POST(request) {
  try {
    const body = await request.json();
    return json(await getProviderOrderStatus(body.providerOrderId || body.orderId));
  } catch (error) {
    return apiError(error);
  }
}
