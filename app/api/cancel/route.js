import { json, apiError } from "../../../lib/http.js";
import { cancelProviderOrders } from "../../../lib/smmwiz.js";

export async function POST(request) {
  try {
    const body = await request.json();
    return json(await cancelProviderOrders(body.providerOrderIds || body.orderIds));
  } catch (error) {
    return apiError(error);
  }
}
