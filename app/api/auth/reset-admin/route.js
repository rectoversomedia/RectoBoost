import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db.js";
import { hashPassword } from "../../../../lib/password.js";

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "email dan password wajib" }, { status: 400 });
    }

    // Only allow updating specific admin emails (security)
    const allowedEmails = [
      "admin@rectoversomedia.com",
      "admin@rectoboost.com",
      "admin@example.com",
      "adminb@rectoversoimedia.com",
      "adminb@rectoversoimeria.com",
      "adminb@rectoversoimedia.com",
    ];

    if (!allowedEmails.includes(email.toLowerCase())) {
      return NextResponse.json({ error: "Email tidak diizinkan" }, { status: 403 });
    }

    const passwordHash = hashPassword(password);

    const user = await prisma.user.upsert({
      where: { email: email.toLowerCase() },
      update: { passwordHash, isActive: true, role: "ADMIN" },
      create: {
        email: email.toLowerCase(),
        fullName: "Admin",
        username: email.toLowerCase().split("@")[0],
        passwordHash,
        role: "ADMIN",
        isActive: true,
        wallet: { create: { balance: 0, currency: "IDR" } },
      },
    });

    return NextResponse.json({
      success: true,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("Reset error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
