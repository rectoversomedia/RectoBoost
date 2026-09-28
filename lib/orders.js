import { calculateOrderPricing } from "./pricing.js";
import { createProviderOrder as createSmmwizOrder } from "./smmwiz.js";
import { createProviderOrder as createYtbotOrder } from "./ytbot.js";
import { getUsdIdrRate } from "./exchangeRate.js";
import { prisma } from "./db.js";
import { selectBestProviderForOrder, resolveServiceForOrder } from "./providers.js";

const PROVIDER_ORDERS = {
  smmwiz: createSmmwizOrder,
  ytbot: createYtbotOrder,
};

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

  if (!link || !isValidUrl(link)) {
    throw new Error("Link tidak valid — masukkan URL lengkap (contoh: https://instagram.com/username)");
  }

  const payment = await prisma.payment.findUnique({
    where:   { id: paymentId },
    include: { orders: true },
  });
  if (!payment)                      throw new Error("Payment tidak ditemukan");
  if (payment.status !== "PAID")    throw new Error("Payment belum dibayar");

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

  const qty = Number(quantity);
  if (qty < Number(service.min)) {
    throw new Error(`Quantity minimum untuk layanan ini adalah ${service.min}`);
  }
  if (qty > Number(service.max)) {
    throw new Error(`Quantity maksimum untuk layanan ini adalah ${service.max}`);
  }

  const userWallet = await prisma.wallet.findUnique({ where: { userId: payment.userId } });
  const chargeAmount = pricing.customerPriceIdr;

  if (!userWallet || userWallet.balance < chargeAmount) {
    throw new Error(`Saldo tidak cukup. Butuh ${chargeAmount.toLocaleString("id-ID")} IDR, saldo tersedia: ${(userWallet?.balance || 0).toLocaleString("id-ID")} IDR`);
  }

  const serviceRecord = await findOrCreateServiceRecord(service, pricing);

  const updatedWallet = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.update({
      where: { userId: payment.userId },
      data: { balance: { decrement: chargeAmount } },
    });

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

  const providerName = serviceRecord.provider;
  const createOrderFn = PROVIDER_ORDERS[providerName];
  if (!createOrderFn) {
    throw new Error(`Provider "${providerName}" tidak tersedia`);
  }

  const providerOrder = await createOrderFn({
    service: serviceRecord.providerServiceId,
    link,
    quantity: qty,
    runs,
    interval,
  });

  const publicId = `RB${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const order = await prisma.order.create({
    data: {
      publicId,
      userId:          payment.userId,
      serviceId:       serviceRecord.id,
      paymentId:       payment.id,
      provider:        providerName,
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
    provider:           providerName,
    providerOrderId:    providerOrder.order,
    providerServiceId:  serviceRecord.providerServiceId,
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
  // Try DB first — multi-provider aware
  const dbRow = await selectBestProviderForOrder(null, String(serviceId));
  if (dbRow) {
    return {
      service:  dbRow.providerServiceId,
      name:     dbRow.name,
      category: dbRow.category,
      type:     dbRow.type,
      min:      dbRow.min,
      max:      dbRow.max,
      rate:     dbRow.providerRateUsdPer1k,
      refill:   dbRow.refill,
      cancel:   dbRow.cancel,
      provider: dbRow.provider,
    };
  }
  // Fallback to live SMMWIZ API (service not yet synced)
  const { getProviderServices } = await import("./smmwiz.js");
  const services = await getProviderServices();
  const service  = services.find((item) => String(item.service) === String(serviceId));
  if (!service) throw new Error("Service tidak ditemukan");
  return { ...service, provider: "smmwiz" };
}

async function findOrCreateServiceRecord(service, pricing) {
  const providerName = service.provider || "smmwiz";

  const existing = await prisma.service.findFirst({
    where: {
      provider:             providerName,
      providerServiceId:    String(service.service),
    },
  });

  if (existing) {
    return prisma.service.update({
      where: { id: existing.id },
      data: {
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
    });
  }

  return prisma.service.create({
    data: {
      provider:             providerName,
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
