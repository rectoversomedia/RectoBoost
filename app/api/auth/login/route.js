import { json, apiError } from "../../../../lib/http.js";
import { prisma } from "../../../../lib/db.js";
import { verifyPassword } from "../../../../lib/password.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return apiError(new Error("Email and password are required"), 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { wallet: true }
    });

    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      return apiError(new Error("Invalid email or password"), 401);
    }

    return json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        balance: user.wallet?.balance || 0,
        currency: user.wallet?.currency || "IDR"
      }
    });
  } catch (error) {
    return apiError(error, 500);
  }
}
