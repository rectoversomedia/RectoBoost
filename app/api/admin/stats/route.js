import { json, apiError } from "../../../../lib/http.js";
import { requireAuth } from "../../../../lib/auth.js";
import { prisma } from "../../../../lib/db.js";
import { getProviderBalance } from "../../../../lib/smmwiz.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { role } = requireAuth(request);
    if (role !== "ADMIN") {
      return apiError(new Error("Forbidden"), 403);
    }

    const [
      totalUsers,
      totalServices,
      totalOrders,
      revenueAgg,
      providerBalance,
      recentOrders,
      ordersByStatus,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.service.count({ where: { isActive: true } }),
      prisma.order.count(),
      prisma.order.aggregate({
        _sum: { charge: true, providerCostIdr: true, profitIdr: true },
      }),
      getProviderBalance().catch(() => ({ balance: "N/A", currency: "USD" })),
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user:    { select: { fullName: true, email: true } },
          service: { select: { name: true, category: true } },
        },
      }),
      prisma.order.groupBy({
        by:     ["status"],
        _count: { status: true },
      }),
    ]);

    return json({
      users:           totalUsers,
      activeServices:  totalServices,
      totalOrders,
      revenue:         { amount: revenueAgg._sum.charge          || 0, currency: "IDR" },
      providerCost:    { amount: revenueAgg._sum.providerCostIdr || 0, currency: "IDR" },
      profit:          { amount: revenueAgg._sum.profitIdr       || 0, currency: "IDR" },
      providerBalance: { amount: providerBalance.balance, currency: providerBalance.currency },
      ordersByStatus:  Object.fromEntries(
        ordersByStatus.map((r) => [r.status, r._count.status])
      ),
      recentOrders: recentOrders.map((o) => ({
        id:        o.publicId,
        user:      o.user?.fullName || o.user?.email,
        service:   o.service?.name,
        category:  o.service?.category,
        quantity:  o.quantity,
        charge:    o.charge,
        profit:    o.profitIdr,
        status:    o.status,
        createdAt: o.createdAt,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}
