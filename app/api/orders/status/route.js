import { json, apiError } from "../../../../lib/http.js";
import { requireAuth } from "../../../../lib/auth.js";
import { getProviderOrderStatus } from "../../../../lib/smmwiz.js";
import { prisma } from "../../../../lib/db.js";

export async function POST(request) {
  try {
    const { userId } = requireAuth(request);

    const body = await request.json();
    const { orderId, providerOrderId } = body;

    if (!orderId && !providerOrderId) {
      return apiError(new Error("orderId atau providerOrderId wajib diisi"), 400);
    }

    // If orderId (public ID), verify ownership
    if (orderId) {
      const order = await prisma.order.findUnique({ where: { publicId: orderId } });
      if (!order) return apiError(new Error("Order tidak ditemukan"), 404);
      if (order.userId !== userId) return apiError(new Error("Akses ditolak"), 403);

      const status = await getProviderOrderStatus(order.providerOrderId || providerOrderId);
      return json(status);
    }

    // providerOrderId path — require auth but no ownership check (admin use case)
    const status = await getProviderOrderStatus(providerOrderId);
    return json(status);
  } catch (error) {
    return apiError(error);
  }
}
