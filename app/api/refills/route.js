import { json, apiError } from "../../../lib/http.js";
import { requireAuth } from "../../../lib/auth.js";
import { createProviderRefill } from "../../../lib/smmwiz.js";
import { prisma } from "../../../lib/db.js";

export async function POST(request) {
  try {
    const { userId } = requireAuth(request);

    const body = await request.json();
    const { orderId, providerOrderId } = body;

    if (!orderId && !providerOrderId) {
      return apiError(new Error("orderId wajib diisi"), 400);
    }

    // Validate ownership if public orderId provided
    if (orderId) {
      const order = await prisma.order.findUnique({ where: { publicId: orderId } });
      if (!order) return apiError(new Error("Order tidak ditemukan"), 404);
      if (order.userId !== userId) return apiError(new Error("Akses ditolak"), 403);
      return json(await createProviderRefill(order.providerOrderId));
    }

    return json(await createProviderRefill(providerOrderId));
  } catch (error) {
    return apiError(error);
  }
}
