import { json, apiError } from "../../../../lib/http.js";
import { hashPassword } from "../../../../lib/password.js";
import { prisma } from "../../../../lib/db.js";

export async function POST(request) {
  try {
    const body     = await request.json();
    const token    = String(body.token    || "").trim();
    const password = String(body.password || "");

    if (!token) {
      return apiError(new Error("Token tidak valid"), 400);
    }
    if (password.length < 8) {
      return apiError(new Error("Password minimal 8 karakter"), 400);
    }

    const record = await prisma.passwordReset.findUnique({ where: { token } });

    if (!record)                       return apiError(new Error("Link reset tidak valid atau sudah digunakan"), 400);
    if (record.usedAt)                 return apiError(new Error("Link reset sudah pernah digunakan"), 400);
    if (record.expiresAt < new Date()) return apiError(new Error("Link reset sudah kadaluarsa. Minta link baru."), 400);

    // Mark token used & update password atomically
    await prisma.$transaction([
      prisma.passwordReset.update({
        where: { id: record.id },
        data:  { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data:  { passwordHash: hashPassword(password) },
      }),
    ]);

    return json({ ok: true, message: "Password berhasil diubah. Silakan login." });
  } catch (error) {
    return apiError(error);
  }
}
