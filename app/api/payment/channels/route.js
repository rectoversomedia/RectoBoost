import { json, apiError } from "../../../../lib/http.js";
import { getPaymentChannels } from "../../../../lib/tripay.js";

export async function GET() {
  try {
    const channels = await getPaymentChannels();
    return json({ channels });
  } catch (error) {
    return apiError(error);
  }
}
