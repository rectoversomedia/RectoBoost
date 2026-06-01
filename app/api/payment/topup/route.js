import { json, apiError, getClientIp } from "../../../../lib/http.js";
import { requireAuth } from "../../../../lib/auth.js";
import { createTransaction } from "../../../../lib/tripay.js";
import { prisma } from "../../../../lib/db.js";
import { paymentLimiter } from "../../../../lib/rateLimit.js";

export async function POST(request) {
  try {
    const { userId } = requireAuth(request);

    const ip = getClientIp(request);
    const rl = paymentLimiter(`topup:${userId}:${ip}`);
    if (!rl.allowed) {
      return apiError(new Error(`Too many requests — try again in ${rl.retryAfter}s`), 429);
    }

    const body = await request.json();
    const { amount, bonusAmount = 0, paymentMethod } = body;

    if (!amount || !paymentMethod) {
      return apiError(new Error("amount dan paymentMethod wajib diisi"), 400);
    }

    const totalAmount = Number(amount);
    if (!Number.isInteger(totalAmount) || totalAmount < 10000) {
      return apiError(new Error("Minimum top up adalah IDR 10.000"), 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { wallet: true } });
    if (!user || !user.isActive) {
      return apiError(new Error("User tidak ditemukan"), 404);
    }

    const merchantRef = `TOPUP-${Date.now()}-${userId.slice(-6)}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://boost.rectoversomedia.com";

    const tripayTx = await createTransaction({
      method:        paymentMethod,
      merchantRef,
      amount:        totalAmount,
      customerName:  user.fullName,
      customerEmail: user.email,
      customerPhone: user.phone || "",
      orderItems:    [{ name: `RectoBoost Top Up — IDR ${totalAmount.toLocaleString("id")}`, price: totalAmount, quantity: 1 }],
      returnUrl:   `${appUrl}/#/add-funds/success`,
      callbackUrl: `${appUrl}/api/payment/webhook`,
    });

    const payment = await prisma.payment.create({
      data: {
        userId,
        provider:          "tripay",
        providerPaymentId: tripayTx.reference,
        status:            "PENDING",
        amount:            totalAmount,
        fee:               tripayTx.total_fee || 0,
        currency:          "IDR",
        method:            paymentMethod,
        invoiceUrl:        tripayTx.checkout_url || null,
        expiredAt:         tripayTx.expired_time ? new Date(tripayTx.expired_time * 1000) : null,
        metadata:          { type: "TOPUP", merchantRef, bonusAmount: Number(bonusAmount) },
      },
    });

    return json({
      paymentId:   payment.id,
      merchantRef,
      amount:      totalAmount,
      currency:    "IDR",
      method:      paymentMethod,
      checkoutUrl: tripayTx.checkout_url || null,
      reference:   tripayTx.reference,
      expiredAt:   payment.expiredAt,
      qrString:    tripayTx.qr_string || null,
      payCode:     tripayTx.pay_code  || null,
      payUrl:      tripayTx.pay_url   || null,
    }, 201);
  } catch (error) {
    return apiError(error);
  }
}
