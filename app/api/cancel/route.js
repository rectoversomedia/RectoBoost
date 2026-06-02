import { json, apiError } from "../../../lib/http.js";
import { requireAuth } from "../../../lib/auth.js";
import { cancelProviderOrders } from "../../../lib/smmwiz.js";
import { prisma } from "../../../lib/db.js";

export async function POST(request) {
  try {
    const { userId } = requireAuth(request);

    const body = await request.json();
    const { orderIds = [] } = body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return apiError(new Error("orderIds wajib diisi"), 400);
    }

    const orders = await prisma.order.findMany({
      where: { publicId: { in: orderIds } },
      select: { userId: true, providerOrderId: true },
    });

    if (orders.some(o => o.userId !== userId)) {
      return apiError(new Error("Akses ditolak — beberapa order bukan milik Anda"), 403);
    }

    const providerIds = orders.map(o => o.providerOrderId).filter(Boolean);
    return json(await cancelProviderOrders(providerIds));
  } catch (error) {
    return apiError(error);
  }
}
