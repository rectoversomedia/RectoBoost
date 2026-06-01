import { json, apiError, getClientIp } from "../../../../lib/http.js";
import { prisma } from "../../../../lib/db.js";
import { sendPasswordResetEmail } from "../../../../lib/mailer.js";
import { forgotLimiter } from "../../../../lib/rateLimit.js";
import crypto from "node:crypto";

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const rl = forgotLimiter(`forgot:${ip}`);
    if (!rl.allowed) {
      return apiError(new Error(`Too many attempts — try again in ${rl.retryAfter}s`), 429);
    }

    const body  = await request.json();
    const email = String(body.email || "").trim().toLowerCase();

    if (!email) {
      return apiError(new Error("Email wajib diisi"), 400);
    }

    // Always return same response to prevent email enumeration
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return json({ ok: true, message: "Jika email terdaftar, link reset akan dikirim." });
    }

    await prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data:  { usedAt: new Date() },
    });

    const token     = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt },
    });

    sendPasswordResetEmail({ toEmail: user.email, toName: user.fullName, token }).catch(() => {});

    return json({ ok: true, message: "Jika email terdaftar, link reset akan dikirim." });
  } catch (error) {
    return apiError(error);
  }
}
