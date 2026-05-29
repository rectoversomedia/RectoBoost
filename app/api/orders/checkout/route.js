import { json, apiError } from "../../../../lib/http.js";
import { createPaidOrder } from "../../../../lib/orders.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const order = await createPaidOrder({
      serviceId: body.serviceId,
      link: body.link,
      quantity: body.quantity,
      paymentId: body.paymentId,
      runs: body.runs,
      interval: body.interval
    });

    return json(order);
  } catch (error) {
    return apiError(error);
  }
}
