import { json, apiError } from "../../../lib/http.js";
import { prisma } from "../../../lib/db.js";
import { calculateRetailPrice } from "../../../lib/pricing.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      serviceId,
      serviceName,
      link,
      quantity,
      proposedPrice,
      customerEmail,
      customerName,
      customerPhone,
    } = body;

    if (!serviceId || !link || !quantity) {
      return apiError(new Error("serviceId, link, dan quantity wajib diisi"), 400);
    }

    if (!customerEmail && !customerName) {
      return apiError(new Error("Email atau nama wajib diisi agar admin bisa follow up"), 400);
    }

    const qty = Number(quantity);
    if (qty < 1) {
      return apiError(new Error("Quantity minimal 1"), 400);
    }

    // Validate URL
    try {
      new URL(link);
    } catch {
      return apiError(new Error("Link tidak valid"), 400);
    }

    const autoPrice = await calculateRetailPrice(
      // Try to find service provider rate
      await prisma.service
        .findUnique({ where: { providerServiceId: String(serviceId) } })
        .then(s => s?.providerRateUsdPer1k ?? 0.001)
    );

    const suggestedTotal = Math.ceil((autoPrice * qty) / 1000);

    const publicId = `QR${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const quote = await prisma.quoteRequest.create({
      data: {
        publicId,
        customerEmail: customerEmail ? String(customerEmail).toLowerCase().trim() : null,
        customerName: customerName ? String(customerName).trim() : null,
        customerPhone: customerPhone ? String(customerPhone).trim() : null,
        serviceId: String(serviceId),
        serviceName: serviceName || "Unknown Service",
        link,
        quantity: qty,
        proposedPrice: proposedPrice ? Number(proposedPrice) : null,
        finalPrice: null,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return json({
      success: true,
      quote: {
        id: quote.publicId,
        status: quote.status,
        autoPrice,
        suggestedTotal,
        message: "Quote request submitted. Admin akan follow up via email/WA.",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
