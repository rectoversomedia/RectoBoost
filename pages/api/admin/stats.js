/**
 * GET /api/admin/stats — real dashboard stats for admin panel.
 * Returns: total orders, revenue, provider cost, profit, active services, user count.
 */

import { prisma } from "../../../lib/db.js";
import { getProviderBalance } from "../../../lib/smmwiz.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
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

    const totalRevenue      = revenueAgg._sum.charge          || 0;
    const totalProviderCost = revenueAgg._sum.providerCostIdr || 0;
    const totalProfit       = revenueAgg._sum.profitIdr       || 0;

    return res.status(200).json({
      users:           totalUsers,
      activeServices:  totalServices,
      totalOrders,
      revenue:         { amount: totalRevenue,      currency: "IDR" },
      providerCost:    { amount: totalProviderCost, currency: "IDR" },
      profit:          { amount: totalProfit,       currency: "IDR" },
      providerBalance: { amount: providerBalance.balance, currency: providerBalance.currency },
      ordersByStatus:  Object.fromEntries(
        ordersByStatus.map((r) => [r.status, r._count.status])
      ),
      recentOrders: recentOrders.map((o) => ({
        id:          o.publicId,
        user:        o.user?.fullName || o.user?.email,
        service:     o.service?.name,
        category:    o.service?.category,
        quantity:    o.quantity,
        charge:      o.charge,
        profit:      o.profitIdr,
        status:      o.status,
        createdAt:   o.createdAt,
      })),
    });
  } catch (err) {
    console.error("[GET /api/admin/stats]", err);
    return res.status(500).json({ error: err.message });
  }
}
