import { prisma } from "../../../lib/db.js";
import { createTransaction } from "../../../lib/tripay.js";
import { quoteOrder } from "../../../lib/orders.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      userId,
      serviceId,
      quantity,
      paymentMethod, // e.g. "BRIVA", "QRIS", "MANDIRIVA"
      link,
    } = req.body || {};

    if (!userId || !serviceId || !quantity || !paymentMethod) {
      return res.status(400).json({
        error: "userId, serviceId, quantity, and paymentMethod are required",
      });
    }

    const user = await prisma.user.findUnique({
      where:   { id: userId },
      include: { wallet: true },
    });
    if (!user || !user.isActive) {
      return res.status(404).json({ error: "User not found" });
    }

    const { pricing } = await quoteOrder({ serviceId, quantity });
    const amount = pricing.customerPriceIdr;

    const merchantRef = `RB-${Date.now()}-${userId.slice(-6)}`;
    const appUrl      = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const tripayTx = await createTransaction({
      method:        paymentMethod,
      merchantRef,
      amount,
      customerName:  user.fullName,
      customerEmail: user.email,
      orderItems: [{
        name:     `RectoBoost Order — Service #${serviceId}`,
        price:    amount,
        quantity: 1,
      }],
      returnUrl:   `${appUrl}/dashboard/orders`,
      callbackUrl: `${appUrl}/api/payment/webhook`,
    });

    // Save payment record to DB
    const payment = await prisma.payment.create({
      data: {
        userId,
        provider:         "tripay",
        providerPaymentId: tripayTx.reference,
        status:            "PENDING",
        amount,
        fee:               tripayTx.total_fee || 0,
        currency:          "IDR",
        method:            paymentMethod,
        invoiceUrl:        tripayTx.checkout_url,
        expiredAt:         tripayTx.expired_time
          ? new Date(tripayTx.expired_time * 1000)
          : null,
        metadata: { merchantRef, serviceId, quantity, link },
      },
    });

    return res.status(201).json({
      paymentId:   payment.id,
      merchantRef,
      amount,
      method:      paymentMethod,
      checkoutUrl: tripayTx.checkout_url,
      reference:   tripayTx.reference,
      expiredAt:   payment.expiredAt,
      qrString:    tripayTx.qr_string   || null,
      payCode:     tripayTx.pay_code    || null,
      payUrl:      tripayTx.pay_url     || null,
    });
  } catch (err) {
    console.error("[POST /api/payment/create]", err);
    return res.status(500).json({ error: err.message });
  }
}
