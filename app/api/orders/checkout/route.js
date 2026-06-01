import { json, apiError } from "../../../../lib/http.js";
import { requireAuth } from "../../../../lib/auth.js";
import { createPaidOrder } from "../../../../lib/orders.js";
import { prisma } from "../../../../lib/db.js";

export async function POST(request) {
  try {
    const { userId } = requireAuth(request);

    const body = await request.json();
    const { serviceId, link, quantity, paymentId, runs, interval } = body;

    if (!paymentId) {
      return apiError(new Error("paymentId wajib diisi"), 400);
    }

    // Verify payment belongs to authenticated user
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      return apiError(new Error("Payment tidak ditemukan"), 404);
    }
    if (payment.userId !== userId) {
      return apiError(new Error("Akses ditolak"), 403);
    }

    const order = await createPaidOrder({ serviceId, link, quantity, paymentId, runs, interval });
    return json(order);
  } catch (error) {
    return apiError(error);
  }
}
