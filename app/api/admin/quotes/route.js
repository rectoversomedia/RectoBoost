import { json, apiError } from "../../../lib/http.js";
import { requireAdmin } from "../../../lib/auth.js";
import { prisma } from "../../../lib/db.js";

export async function GET(request) {
  try {
    requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const quotes = await prisma.quoteRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return json({ success: true, quotes });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request) {
  try {
    requireAdmin(request);
    const body = await request.json();
    const { id, status, finalPrice, adminNote } = body;

    if (!id) {
      return apiError(new Error("Quote ID wajib diisi"), 400);
    }

    const update = {};
    if (status) {
      const allowed = ["PENDING", "QUOTED", "APPROVED", "REJECTED", "EXPIRED", "CONVERTED"];
      if (!allowed.includes(status)) {
        return apiError(new Error("Status tidak valid"), 400);
      }
      update.status = status;
    }
    if (finalPrice !== undefined) {
      update.finalPrice = Number(finalPrice);
    }
    if (adminNote !== undefined) {
      update.adminNote = String(adminNote);
    }

    const quote = await prisma.quoteRequest.update({
      where: { publicId: id },
      data: update,
    });

    return json({ success: true, quote });
  } catch (error) {
    return apiError(error);
  }
}
