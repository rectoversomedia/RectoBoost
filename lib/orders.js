import { calculateOrderPricing } from "./pricing.js";
import { createProviderOrder, getProviderServices } from "./smmwiz.js";
import { getUsdIdrRate } from "./exchangeRate.js";
import { prisma } from "./db.js";

export async function quoteOrder({ serviceId, quantity }) {
  const service = await findService(serviceId);
  // Fetch live rate (cached for 24 hours, fallback to .env)
  const liveRate = await getUsdIdrRate();
  
  return {
    service,
    pricing: calculateOrderPricing(service, quantity, liveRate),
    usdIdrRate: liveRate
  };
}

export async function createPaidOrder({ serviceId, link, quantity, paymentId, runs, interval }) {
  if (!paymentId) {
    throw new Error("paymentId is required before sending an order to SMMWIZ");
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { orders: true }
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.status !== "PAID") throw new Error("Payment is not paid yet");
  if (payment.orders.length) {
    return {
      rectoboostOrderId: payment.orders[0].publicId,
      paymentId,
      provider: payment.orders[0].provider,
      providerOrderId: payment.orders[0].providerOrderId,
      status: payment.orders[0].status
    };
  }

  const { service, pricing, usdIdrRate } = await quoteOrder({ serviceId, quantity });
  const serviceRecord = await findOrCreateServiceRecord(service, pricing);

  const providerOrder = await createProviderOrder({
    service: service.service,
    link,
    quantity,
    runs,
    interval
  });
  const publicId = `RB${Date.now()}`;
  const order = await prisma.order.create({
    data: {
      publicId,
      userId: payment.userId,
      serviceId: serviceRecord.id,
      paymentId: payment.id,
      provider: "smmwiz",
      providerOrderId: String(providerOrder.order || ""),
      link,
      quantity: Number(quantity),
      charge: pricing.customerPriceIdr,
      providerCostIdr: pricing.providerCostIdr,
      profitIdr: pricing.profitIdr,
      status: "PROCESSING",
      rawStatus: "Processing",
      note: "Order sent to SMMWIZ after paid payment."
    }
  });

  return {
    rectoboostOrderId: order.publicId,
    paymentId,
    provider: "smmwiz",
    providerOrderId: providerOrder.order,
    providerServiceId: service.service,
    serviceName: service.name,
    link,
    quantity,
    pricing,
    usdIdrRate,
    status: "Processing"
  };
}

async function findService(serviceId) {
  const services = await getProviderServices();
  const service = services.find((item) => String(item.service) === String(serviceId));
  if (!service) throw new Error("Service not found");
  return service;
}

async function findOrCreateServiceRecord(service, pricing) {
  return prisma.service.upsert({
    where: { providerServiceId: String(service.service) },
    update: {
      name: service.name,
      category: service.category,
      type: service.type,
      min: Number(service.min || 0),
      max: Number(service.max || 0),
      providerRateUsdPer1k: String(service.rate || 0),
      retailPricePer1k: pricing.retailPricePer1k,
      refill: Boolean(service.refill),
      cancel: Boolean(service.cancel),
      isActive: true,
      raw: service,
      syncedAt: new Date()
    },
    create: {
      provider: "smmwiz",
      providerServiceId: String(service.service),
      name: service.name,
      category: service.category,
      type: service.type,
      min: Number(service.min || 0),
      max: Number(service.max || 0),
      providerRateUsdPer1k: String(service.rate || 0),
      retailPricePer1k: pricing.retailPricePer1k,
      refill: Boolean(service.refill),
      cancel: Boolean(service.cancel),
      isActive: true,
      raw: service
    }
  });
}
