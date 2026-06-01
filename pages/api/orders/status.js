import { prisma } from "../../../lib/db.js";
import { getProviderOrderStatus } from "../../../lib/smmwiz.js";

const STATUS_MAP = {
  Pending:     "PENDING",
  Processing:  "PROCESSING",
  "In progress": "IN_PROGRESS",
  Partial:     "PARTIAL",
  Completed:   "COMPLETED",
  Canceled:    "CANCELED",
  Cancelled:   "CANCELED",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    const order = await prisma.order.findUnique({
      where: { publicId: orderId },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (!order.providerOrderId) {
      return res.status(200).json({
        orderId,
        status:    order.status,
        rawStatus: order.rawStatus,
        note:      "No provider order ID yet",
      });
    }

    const providerStatus = await getProviderOrderStatus(order.providerOrderId);

    const normalizedStatus = STATUS_MAP[providerStatus.status] || order.status;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status:     normalizedStatus,
        rawStatus:  providerStatus.status,
        startCount: providerStatus.start_count != null ? Number(providerStatus.start_count) : undefined,
        remains:    providerStatus.remains    != null ? Number(providerStatus.remains)    : undefined,
      },
    });

    return res.status(200).json({
      orderId,
      providerOrderId: order.providerOrderId,
      status:          normalizedStatus,
      rawStatus:       providerStatus.status,
      startCount:      providerStatus.start_count,
      remains:         providerStatus.remains,
      charge:          providerStatus.charge,
    });
  } catch (err) {
    console.error("[POST /api/orders/status]", err);
    return res.status(500).json({ error: err.message });
  }
}
