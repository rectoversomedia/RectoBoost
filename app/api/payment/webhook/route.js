import { json, apiError } from "../../../../lib/http.js";
import { verifyWebhookSignature, mapTripayStatus } from "../../../../lib/tripay.js";
import { prisma } from "../../../../lib/db.js";
import { createPaidOrder } from "../../../../lib/orders.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const callbackSign = request.headers.get("x-callback-signature") || "";
    const expectedSign = verifyWebhookSignature(rawBody);

    if (callbackSign !== expectedSign) {
      console.warn("[webhook] Invalid Tripay signature — rejecting");
      return apiError(new Error("Invalid signature"), 401);
    }

    const payload = JSON.parse(rawBody);
    const { reference, status, paid_at } = payload;

    if (!reference) {
      return apiError(new Error("Missing reference"), 400);
    }

    const payment = await prisma.payment.findFirst({
      where: { providerPaymentId: reference },
    });

    if (!payment) {
      console.warn("[webhook] Payment not found for reference:", reference);
      return json({ received: true, message: "Ignored — payment not found" });
    }

    const newStatus = mapTripayStatus(status);

    // Idempotency guard — kalau sudah PAID sebelumnya, jangan proses ulang
    if (payment.paidAt && newStatus === "PAID") {
      console.log("[webhook] Already processed — skipping:", reference);
      return json({ success: true, status: newStatus, idempotent: true });
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        paidAt: newStatus === "PAID" && paid_at ? new Date(paid_at * 1000) : undefined,
        metadata: { ...(payment.metadata || {}), tripayCallback: payload },
      },
    });

    if (newStatus !== "PAID" || !updatedPayment.metadata) {
      return json({ success: true, status: newStatus });
    }

    const meta = updatedPayment.metadata;

    // TOPUP — tambah saldo wallet
    if (meta.type === "TOPUP") {
      try {
        const topupCredit = Number(payment.amount) + Number(meta.bonusAmount || 0);
        await prisma.$transaction([
          prisma.wallet.upsert({
            where:  { userId: payment.userId },
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
      }
      return json({ success: true, status: newStatus });
    }

    // ORDER — kirim ke SMMWIZ
    let order = null;
    if (meta.serviceId && meta.quantity) {
      try {
        order = await createPaidOrder({
          serviceId: meta.serviceId,
          link:      meta.link || "",
          quantity:  meta.quantity,
          paymentId: updatedPayment.id,
        });
      } catch (orderErr) {
        console.error("[webhook] Order submission failed:", orderErr.message);
      }
    }

    return json({ success: true, status: newStatus, order });
  } catch (error) {
    return apiError(error, 400);
  }
}
