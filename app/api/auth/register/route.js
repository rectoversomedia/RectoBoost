import { jsonWithToken, apiError, getClientIp } from "../../../../lib/http.js";
import { hashPassword } from "../../../../lib/password.js";
import { prisma } from "../../../../lib/db.js";
import { sendWelcomeEmail } from "../../../../lib/mailer.js";
import { signToken } from "../../../../lib/jwt.js";
import { authLimiter } from "../../../../lib/rateLimit.js";

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const rl = authLimiter(`register:${ip}`);
    if (!rl.allowed) {
      return apiError(new Error(`Too many attempts — try again in ${rl.retryAfter}s`), 429);
    }

    const body     = await request.json();
    const email    = String(body.email    || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.fullName || body.name || "").trim();

    if (!email || !password || !fullName) {
      return apiError(new Error("Nama lengkap, email, dan password wajib diisi"), 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError(new Error("Format email tidak valid"), 400);
    }

    if (password.length < 8) {
      return apiError(new Error("Password minimal 8 karakter"), 400);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return apiError(new Error("Email sudah terdaftar"), 409);
    }

    const username =
      email.split("@")[0].replace(/[^a-z0-9_]/gi, "").slice(0, 20) +
      Math.floor(Math.random() * 1000);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
        fullName,
        username,
        role:     "MEMBER",
        isActive: true,
        wallet:   { create: { balance: 0, currency: "IDR" } },
      },
      include: { wallet: true },
    });

    sendWelcomeEmail({ toEmail: user.email, toName: user.fullName }).catch(() => {});

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    return jsonWithToken({
      authenticated: true,
      user: {
        id:       user.id,
        email:    user.email,
        fullName: user.fullName,
        username: user.username,
        role:     user.role,
        balance:  user.wallet?.balance  || 0,
        currency: user.wallet?.currency || "IDR",
      },
    }, token, 201);
  } catch (error) {
    return apiError(error);
  }
}
