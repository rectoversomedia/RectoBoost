import { json, apiError } from "../../../lib/http.js";
import { createProviderRefill } from "../../../lib/smmwiz.js";

export async function POST(request) {
  try {
    const body = await request.json();
    return json(await createProviderRefill(body.providerOrderId || body.orderId));
  } catch (error) {
    return apiError(error);
  }
}
