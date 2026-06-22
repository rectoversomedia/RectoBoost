import { calculateOrderPricing } from "./pricing.js";
import { createProviderOrder, getProviderServices } from "./smmwiz.js";
import { getUsdIdrRate } from "./exchangeRate.js";
import { prisma } from "./db.js";

export async function quoteOrder({ serviceId, quantity }) {
  const service  = await findService(serviceId);
  const liveRate = await getUsdIdrRate();
  return {
    service,
    pricing:    calculateOrderPricing(service, quantity, liveRate),
    usdIdrRate: liveRate,
  };
}

export async function createPaidOrder({ serviceId, link, quantity, paymentId, runs, interval }) {
  if (!paymentId) {
    throw new Error("paymentId diperlukan sebelum order dikirim ke provider");
  }

  // Validate link is a real URL
  if (!link || !isValidUrl(link)) {
    throw new Error("Link tidak valid — masukkan URL lengkap (contoh: https://instagram.com/username)");
  }

  const payment = await prisma.payment.findUnique({
    where:   { id: paymentId },
    include: { orders: true },
  });
  if (!payment)                      throw new Error("Payment tidak ditemukan");
  if (payment.status !== "PAID")    throw new Error("Payment belum dibayar");

  // Idempotency — return existing order if already created
  if (payment.orders.length) {
    const existing = payment.orders[0];
    return {
      rectoboostOrderId: existing.publicId,
      paymentId,
      provider:        existing.provider,
      providerOrderId: existing.providerOrderId,
      status:          existing.status,
    };
  }

  const { service, pricing, usdIdrRate } = await quoteOrder({ serviceId, quantity });

  // Validate quantity within service limits
  const qty = Number(quantity);
  if (qty < Number(service.min)) {
    throw new Error(`Quantity minimum untuk layanan ini adalah ${service.min}`);
  }
  if (qty > Number(service.max)) {
    throw new Error(`Quantity maksimum untuk layanan ini adalah ${service.max}`);
  }

  // Get user wallet for balance check
  const userWallet = await prisma.wallet.findUnique({ where: { userId: payment.userId } });
  const chargeAmount = pricing.customerPriceIdr;

  // Validate sufficient balance
  if (!userWallet || userWallet.balance < chargeAmount) {
    throw new Error(`Saldo tidak cukup. Butuh ${chargeAmount.toLocaleString("id-ID")} IDR, saldo tersedia: ${(userWallet?.balance || 0).toLocaleString("id-ID")} IDR`);
  }

  const serviceRecord = await findOrCreateServiceRecord(service, pricing);

  // Deduct balance from wallet with transaction record
  const updatedWallet = await prisma.$transaction(async (tx) => {
    // Deduct from wallet
    const wallet = await tx.wallet.update({
      where: { userId: payment.userId },
      data: { balance: { decrement: chargeAmount } },
    });

    // Create wallet transaction record
    await tx.walletTransaction.create({
      data: {
        userId:       payment.userId,
        type:         "ORDER_PAYMENT",
        status:       "SUCCESS",
        amount:       chargeAmount,
        balanceAfter: wallet.balance,
        currency:     "IDR",
        reference:    `ORDER-${Date.now()}`,
        note:         `Pembayaran order: ${service.name} (${qty} pcs)`,
      },
    });

    return wallet;
  });

  const providerOrder = await createProviderOrder({ service: service.service, link, quantity: qty, runs, interval });

  const publicId = `RB${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const order = await prisma.order.create({
    data: {
      publicId,
      userId:          payment.userId,
      serviceId:       serviceRecord.id,
      paymentId:       payment.id,
      provider:        "smmwiz",
      providerOrderId: String(providerOrder.order || ""),
      link,
      quantity:        qty,
      charge:          chargeAmount,
      providerCostIdr: pricing.providerCostIdr,
      profitIdr:       pricing.profitIdr,
      status:          "PROCESSING",
      rawStatus:       "Processing",
    },
  });

  return {
    rectoboostOrderId:  order.publicId,
    paymentId,
    provider:           "smmwiz",
    providerOrderId:    providerOrder.order,
    providerServiceId:  service.service,
    serviceName:        service.name,
    link,
    quantity:           qty,
    pricing,
    usdIdrRate,
    status:             "Processing",
    remainingBalance:   updatedWallet.balance,
  };
}

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function findService(serviceId) {
  // Try DB first (fast, no API call)
  const dbService = await prisma.service.findUnique({
    where: { providerServiceId: String(serviceId) },
  });
  if (dbService) {
    return {
      service:  dbService.providerServiceId,
      name:     dbService.name,
      category: dbService.category,
      type:     dbService.type,
      min:      dbService.min,
      max:      dbService.max,
      rate:     dbService.providerRateUsdPer1k,
      refill:   dbService.refill,
      cancel:   dbService.cancel,
    };
  }
  // Fallback to live API (service not yet synced)
  const services = await getProviderServices();
  const service  = services.find((item) => String(item.service) === String(serviceId));
  if (!service) throw new Error("Service tidak ditemukan");
  return service;
}

async function findOrCreateServiceRecord(service, pricing) {
  return prisma.service.upsert({
    where:  { providerServiceId: String(service.service) },
    update: {
      name:                 service.name,
      category:             service.category,
      type:                 service.type,
      min:                  Number(service.min || 0),
      max:                  Number(service.max || 0),
      providerRateUsdPer1k: String(service.rate || 0),
      retailPricePer1k:     pricing.retailPricePer1k,
      refill:               Boolean(service.refill),
      cancel:               Boolean(service.cancel),
      isActive:             true,
      raw:                  service,
      syncedAt:             new Date(),
    },
    create: {
      provider:             "smmwiz",
      providerServiceId:    String(service.service),
      name:                 service.name,
      category:             service.category,
      type:                 service.type,
      min:                  Number(service.min || 0),
      max:                  Number(service.max || 0),
      providerRateUsdPer1k: String(service.rate || 0),
      retailPricePer1k:     pricing.retailPricePer1k,
      refill:               Boolean(service.refill),
      cancel:               Boolean(service.cancel),
      isActive:             true,
      raw:                  service,
    },
  });
}
