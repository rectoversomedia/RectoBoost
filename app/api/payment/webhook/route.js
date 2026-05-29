import { json, apiError } from "../../../../lib/http.js";
import { mapDuitkuStatus, verifyCallbackSignature } from "../../../../lib/duitku.js";
import { prisma } from "../../../../lib/db.js";
import { createPaidOrder } from "../../../../lib/orders.js";

export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let payload;

    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries());
    }

    if ((process.env.PAYMENT_PROVIDER_MODE || "manual") === "duitku") {
      if (!verifyCallbackSignature(payload)) {
        return apiError(new Error("Invalid Duitku callback signature"), 401);
      }
      const status = mapDuitkuStatus(payload.resultCode);
      const payment = await prisma.payment.findFirst({
        where: {
          OR: [
            { id: String(payload.merchantOrderId || "") },
            { providerPaymentId: String(payload.reference || "") },
            { providerPaymentId: String(payload.merchantOrderId || "") }
          ]
        }
      });
      let order = null;
      if (payment) {
        const updatedPayment = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status,
            paidAt: status === "PAID" ? new Date() : payment.paidAt,
            metadata: {
              ...(payment.metadata || {}),
              duitkuCallback: payload
            }
          }
        });

        const metadata = updatedPayment.metadata || {};
        if (status === "PAID" && metadata.serviceId && metadata.link) {
          order = await createPaidOrder({
            serviceId: metadata.serviceId,
            link: metadata.link,
            quantity: metadata.quantity,
            paymentId: updatedPayment.id
          });
        }
      }

      return json({
        received: true,
        provider: "duitku",
        paymentId: payload.merchantOrderId || null,
        reference: payload.reference || null,
        status,
        order,
        resultCode: payload.resultCode,
        amount: Number(payload.amount || payload.paymentAmount || 0)
      });
    }

    return json({
      received: true,
      paymentId: payload.paymentId || payload.id || null,
      status: payload.status || "received"
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
