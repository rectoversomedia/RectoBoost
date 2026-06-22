import crypto from "node:crypto";
import { json, apiError } from "../../../../lib/http.js";
import { verifyWebhookSignature, mapTripayStatus } from "../../../../lib/tripay.js";
import { prisma } from "../../../../lib/db.js";
import { createPaidOrder } from "../../../../lib/orders.js";

export const dynamic = "force-dynamic";

// In-memory idempotency cache for webhook (handles race conditions)
const idempotencyCache = new Map();
const IDEMPOTENCY_TTL = 60000; // 1 minute

function isIdempotent(id) {
  const cached = idempotencyCache.get(id);
  if (cached === "processing" || cached === "done") return true;
  return false;
}

function setIdempotent(id, status) {
  idempotencyCache.set(id, status);
  // Cleanup old entries
  if (idempotencyCache.size > 1000) {
    const now = Date.now();
    for (const [key, val] of idempotencyCache.entries()) {
      if (val === "done" && !idempotencyCache.has(key + "_time")) {
        idempotencyCache.delete(key);
      }
    }
  }
}

export async function POST(request) {
  try {
    // Read raw body for signature verification
    const rawBody = await request.text();
    const callbackSign = request.headers.get("x-callback-signature") || "";

    // Verify webhook signature
    const expectedSign = verifyWebhookSignature(rawBody);

    // Safe buffer comparison
    let signatureValid = false;
    try {
      const a = Buffer.from(callbackSign, "hex");
      const b = Buffer.from(expectedSign, "hex");
      signatureValid = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
    } catch (e) {
      signatureValid = false;
    }

    if (!signatureValid) {
      console.warn("[webhook] Invalid Tripay signature — rejecting");
      return apiError(new Error("Invalid signature"), 401);
    }

    // Parse payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return apiError(new Error("Invalid JSON payload"), 400);
    }

    const { reference, status, paid_at } = payload;

    if (!reference) {
      return apiError(new Error("Missing reference"), 400);
    }

    // Idempotency check — prevent race condition on rapid calls
    if (isIdempotent(reference)) {
      console.log("[webhook] Idempotent request — already processing/completed:", reference);
      return json({ received: true, message: "Already processed", idempotent: true });
    }
    setIdempotent(reference, "processing");

    try {
      // Find payment
      const payment = await prisma.payment.findFirst({
        where: { providerPaymentId: reference },
      });

      if (!payment) {
        console.warn("[webhook] Payment not found for reference:", reference);
        setIdempotent(reference, "done");
        return json({ received: true, message: "Ignored — payment not found" });
      }

      const newStatus = mapTripayStatus(status);

      // Check if already PAID (idempotency at DB level)
      if (payment.status === "PAID" && payment.paidAt) {
        console.log("[webhook] Payment already PAID — skipping:", reference);
        setIdempotent(reference, "done");
        return json({ received: true, status: "PAID", message: "Already paid" });
      }

      // Update payment status
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          paidAt: newStatus === "PAID" && paid_at ? new Date(paid_at * 1000) : undefined,
          metadata: { ...(payment.metadata || {}), tripayCallback: payload },
        },
      });

      // If not PAID, just return success
      if (newStatus !== "PAID") {
        console.log(`[webhook] Payment status update: ${reference} -> ${newStatus}`);
        setIdempotent(reference, "done");
        return json({ received: true, status: newStatus });
      }

      const meta = updatedPayment.metadata || {};

      // TOPUP — credit wallet
      if (meta.type === "TOPUP") {
        try {
          const topupCredit = Number(payment.amount) + Number(meta.bonusAmount || 0);

          await prisma.$transaction([
            prisma.wallet.upsert({
              where: { userId: payment.userId },
              update: { balance: { increment: topupCredit } },
              create: { userId: payment.userId, balance: topupCredit, currency: "IDR" },
            }),
            prisma.walletTransaction.create({
              data: {
                userId:      payment.userId,
                type:        "TOPUP",
                status:      "SUCCESS",
                amount:      topupCredit,
                currency:    "IDR",
                reference:   payment.providerPaymentId,
                note:        `Top up via ${payment.method} — Ref: ${meta.merchantRef}`,
              },
            }),
          ]);

          console.log(`[webhook] Wallet topped up: user=${payment.userId} amount=${topupCredit}`);
        } catch (err) {
          console.error("[webhook] Wallet topup failed:", err.message);
          // Don't return error - webhook should still acknowledge
        }

        setIdempotent(reference, "done");
        return json({ received: true, status: newStatus, walletCredited: true });
      }

      // ORDER — submit to SMMWIZ
      let order = null;
      if (meta.serviceId && meta.quantity) {
        try {
          order = await createPaidOrder({
            serviceId: meta.serviceId,
            link:      meta.link || "",
            quantity:  meta.quantity,
            paymentId: updatedPayment.id,
          });
          console.log(`[webhook] Order created: ${order.rectoboostOrderId}`);
        } catch (orderErr) {
          console.error("[webhook] Order submission failed:", orderErr.message);
          // Don't fail webhook - payment is already confirmed
        }
      }

      setIdempotent(reference, "done");
      return json({
        received: true,
        status: newStatus,
        order: order ? {
          orderId: order.rectoboostOrderId,
          providerOrderId: order.providerOrderId,
        } : null
      });

    } catch (error) {
      setIdempotent(reference, "done");
      throw error;
    }

  } catch (error) {
    console.error("[webhook] Unexpected error:", error.message);
    return apiError(error, 500);
  }
}
