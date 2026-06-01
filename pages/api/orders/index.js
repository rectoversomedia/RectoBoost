import { prisma } from "../../../lib/db.js";
import { quoteOrder, createPaidOrder } from "../../../lib/orders.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    return handleList(req, res);
  }
  if (req.method === "POST") {
    return handleCreate(req, res);
  }
  return res.status(405).json({ error: "Method not allowed" });
}

/** GET /api/orders?userId=... — list orders for a user */
async function handleList(req, res) {
  try {
    const { userId, status, limit = "50", offset = "0" } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const where = { userId };
    if (status) where.status = status.toUpperCase();

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take:   Number(limit),
        skip:   Number(offset),
        include: {
          service: {
            select: { name: true, category: true, providerServiceId: true },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return res.status(200).json({
      total,
      orders: orders.map((o) => ({
        id:              o.publicId,
        serviceId:       o.service?.providerServiceId,
        serviceName:     o.service?.name,
        serviceCategory: o.service?.category,
        link:            o.link,
        quantity:        o.quantity,
        charge:          o.charge,
        status:          o.status,
        providerOrderId: o.providerOrderId,
        createdAt:       o.createdAt,
        updatedAt:       o.updatedAt,
      })),
    });
  } catch (err) {
    console.error("[GET /api/orders]", err);
    return res.status(500).json({ error: err.message });
  }
}

/** POST /api/orders — quote or place an order */
async function handleCreate(req, res) {
  try {
    const { action, serviceId, quantity, link, paymentId, runs, interval } = req.body || {};

    if (!serviceId || !quantity) {
      return res.status(400).json({ error: "serviceId and quantity are required" });
    }

    // action=quote → return pricing only, no order placed
    if (action === "quote" || !paymentId) {
      const quote = await quoteOrder({ serviceId, quantity });
      return res.status(200).json({
        quote: true,
        serviceId,
        quantity,
        pricing:   quote.pricing,
        usdIdrRate: quote.usdIdrRate,
      });
    }

    // action=checkout → place real order (requires paid payment)
    if (!link) {
      return res.status(400).json({ error: "link is required for order submission" });
    }

    const order = await createPaidOrder({ serviceId, link, quantity, paymentId, runs, interval });
    return res.status(201).json(order);
  } catch (err) {
    console.error("[POST /api/orders]", err);
    const status = err.message?.includes("not found") ? 404
      : err.message?.includes("not paid")   ? 402
      : 500;
    return res.status(status).json({ error: err.message });
  }
}
