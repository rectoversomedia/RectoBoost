import { prisma } from "../../../lib/db.js";
import { verifyPassword } from "../../../lib/password.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({
      where:   { email: String(email).trim().toLowerCase() },
      include: { wallet: true },
    });

    if (!user || !user.isActive || !verifyPassword(String(password), user.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.status(200).json({
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
    });
  } catch (err) {
    console.error("[POST /api/auth/login]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
