import { jsonWithToken, apiError, getClientIp } from "../../../../lib/http.js";
import { prisma } from "../../../../lib/db.js";
import { verifyPassword } from "../../../../lib/password.js";
import { signToken } from "../../../../lib/jwt.js";
import { authLimiter } from "../../../../lib/rateLimit.js";

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const rl = authLimiter(`login:${ip}`);
    if (!rl.allowed) {
      return apiError(new Error(`Too many attempts — try again in ${rl.retryAfter}s`), 429);
    }

    const body     = await request.json();
    const email    = String(body.email    || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return apiError(new Error("Email dan password wajib diisi"), 400);
    }

    const user = await prisma.user.findUnique({
      where:   { email },
      include: { wallet: true },
    });

    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      return apiError(new Error("Email atau password salah"), 401);
    }

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
    }, token);
  } catch (error) {
    return apiError(error);
  }
}
