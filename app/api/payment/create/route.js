import { json, apiError } from "../../../../lib/http.js";
import { quoteOrder } from "../../../../lib/orders.js";
import { createDuitkuTransaction } from "../../../../lib/duitku.js";
import { prisma } from "../../../../lib/db.js";
import { getCurrentUser } from "../../../../lib/users.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const quote = await quoteOrder({
      serviceId: body.serviceId,
      quantity: body.quantity
    });
    const user = await getCurrentUser();
    const mode = process.env.PAYMENT_PROVIDER_MODE || "manual";
    const merchantOrderId = body.merchantOrderId || `PAY-${Date.now()}`;
    const basePayment = await prisma.payment.create({
      data: {
        userId: user.id,
        provider: mode === "duitku" ? "duitku" : "manual",
        providerPaymentId: merchantOrderId,
        status: mode === "duitku" ? "PENDING" : "PAID",
        amount: quote.pricing.customerPriceIdr,
        currency: "IDR",
        method: body.paymentMethod || (mode === "duitku" ? "Duitku" : "Manual"),
        paidAt: mode === "duitku" ? null : new Date(),
        metadata: {
          serviceId: body.serviceId,
          link: body.link || "",
          quantity: body.quantity,
          quote
        }
      }
    });

    if (mode === "duitku") {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const invoice = await createDuitkuTransaction({
        amount: quote.pricing.customerPriceIdr,
        paymentMethod: body.paymentMethod || process.env.DUITKU_DEFAULT_PAYMENT_METHOD || "",
        merchantOrderId,
        productDetails: body.productDetails || quote.service.name,
        customerName: body.customerName || "RectoBoost Member",
        email: body.email || "customer@rectoboost.com",
        phoneNumber: body.phoneNumber || "",
        callbackUrl: body.callbackUrl || `${appUrl}/api/payment/webhook`,
        returnUrl: body.returnUrl || `${appUrl}/index.html#/add-funds/success`,
        itemDetails: [
          {
            name: quote.service.name,
            price: quote.pricing.customerPriceIdr,
            quantity: 1
          }
        ]
      });
      const payment = await prisma.payment.update({
        where: { id: basePayment.id },
        data: {
          providerPaymentId: invoice.reference || merchantOrderId,
          invoiceUrl: invoice.paymentUrl || null,
          metadata: {
            ...basePayment.metadata,
            duitku: invoice,
            merchantOrderId
          }
        }
      });

      return json({
        paymentId: payment.id,
        merchantOrderId,
        status: "PENDING",
        mode,
        provider: "duitku",
        amount: quote.pricing.customerPriceIdr,
        currency: "IDR",
        paymentUrl: invoice.paymentUrl,
        vaNumber: invoice.vaNumber,
        qrString: invoice.qrString,
        reference: invoice.reference,
        raw: invoice
      });
    }

    return json({
      paymentId: basePayment.id,
      status: "PAID",
      mode,
      amount: quote.pricing.customerPriceIdr,
      currency: "IDR",
      serviceId: body.serviceId,
      quantity: body.quantity
    });
  } catch (error) {
    return apiError(error);
  }
}
