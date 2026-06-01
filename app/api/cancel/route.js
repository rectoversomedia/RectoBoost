import { json, apiError } from "../../../lib/http.js";
import { requireAuth } from "../../../lib/auth.js";
import { cancelProviderOrders } from "../../../lib/smmwiz.js";
import { prisma } from "../../../lib/db.js";

export async function POST(request) {
  try {
    const { userId } = requireAuth(request);

    const body = await request.json();
    const { orderIds = [], providerOrderIds = [] } = body;

    // If public orderIds provided, validate all belong to authenticated user
    if (orderIds.length > 0) {
      const orders = await prisma.order.findMany({
        where: { publicId: { in: orderIds } },
        select: { userId: true, providerOrderId: true },
      });

      if (orders.some(o => o.userId !== userId)) {
        return apiError(new Error("Akses ditolak — beberapa order bukan milik Anda"), 403);
      }

      const ids = orders.map(o => o.providerOrderId).filter(Boolean);
      return json(await cancelProviderOrders(ids));
    }

    if (providerOrderIds.length === 0) {
      return apiError(new Error("orderIds atau providerOrderIds wajib diisi"), 400);
    }

    return json(await cancelProviderOrders(providerOrderIds));
  } catch (error) {
    return apiError(error);
  }
}
