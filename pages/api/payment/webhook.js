/**
 * POST /api/payment/webhook
 * Tripay will POST to this endpoint when payment status changes.
 * Docs: https://tripay.co.id/developer#callback
 */

import { prisma } from "../../../lib/db.js";
import { verifyWebhookSignature, mapTripayStatus } from "../../../lib/tripay.js";
import { createPaidOrder } from "../../../lib/orders.js";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end",  () => resolve(body));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rawBody       = await readRawBody(req);
    const callbackSign  = req.headers["x-callback-signature"] || "";
    const expectedSign  = verifyWebhookSignature(rawBody);

    if (callbackSign !== expectedSign) {
      console.warn("[webhook] Invalid signature — rejecting");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const payload = JSON.parse(rawBody);
    const { reference, merchant_ref, status, paid_at } = payload;

    if (!reference) {
      return res.status(400).json({ error: "Missing reference" });
    }

    const payment = await prisma.payment.findFirst({
      where: { providerPaymentId: reference },
    });

    if (!payment) {
      console.warn("[webhook] Payment not found for reference:", reference);
      return res.status(200).json({ message: "Ignored — payment not found" });
    }

    const newStatus = mapTripayStatus(status);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status:  newStatus,
        paidAt:  newStatus === "PAID" && paid_at ? new Date(paid_at * 1000) : undefined,
        metadata: { ...payment.metadata, tripayCallback: payload },
      },
    });

    // Auto-submit order to SMMWIZ once payment is confirmed
    if (newStatus === "PAID" && payment.metadata) {
      const meta = payment.metadata;
      if (meta.serviceId && meta.quantity) {
        try {
          await createPaidOrder({
            serviceId: meta.serviceId,
            link:      meta.link || "",
            quantity:  meta.quantity,
            paymentId: payment.id,
          });
        } catch (orderErr) {
          console.error("[webhook] Order submission failed:", orderErr.message);
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[POST /api/payment/webhook]", err);
    return res.status(500).json({ error: err.message });
  }
}
