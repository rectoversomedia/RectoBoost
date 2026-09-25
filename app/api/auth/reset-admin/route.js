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
    ];

    if (!allowedEmails.includes(email.toLowerCase())) {
      return NextResponse.json({ error: "Email tidak diizinkan" }, { status: 403 });
    }

    const passwordHash = hashPassword(password);

    const user = await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { passwordHash, isActive: true },
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
