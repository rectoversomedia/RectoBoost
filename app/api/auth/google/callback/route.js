import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db.js";
import { hashPassword } from "../../../../../lib/password.js";
import { signToken } from "../../../../../lib/jwt.js";
import { jsonWithToken } from "../../../../../lib/http.js";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://boost.rectoversomedia.com";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${APP_URL}/#/login?error=${encodeURIComponent(error)}`);
  }

  // Verify state
  const storedState = request.cookies.get("oauth_state")?.value;
  if (!state || state !== storedState) {
    return NextResponse.redirect(`${APP_URL}/#/login?error=invalid_state`);
  }

  if (!code || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(`${APP_URL}/#/login?error=oauth_failed`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${APP_URL}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${APP_URL}/#/login?error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Get user info
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      return NextResponse.redirect(`${APP_URL}/#/login?error=userinfo_failed`);
    }

    const googleUser = await userInfoRes.json();
    const email = (googleUser.email || "").toLowerCase().trim();
    const fullName = googleUser.name || googleUser.email?.split("@")[0] || "Google User";
    const googleId = googleUser.id;

    if (!email) {
      return NextResponse.redirect(`${APP_URL}/#/login?error=no_email`);
    }

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email }, include: { wallet: true } });

    if (!user) {
      // Create new user from Google
      const username = email.split("@")[0].replace(/[^a-z0-9_]/gi, "").slice(0, 20) + Math.floor(Math.random() * 1000);
      user = await prisma.user.create({
        data: {
          email,
          fullName,
          username,
          passwordHash: hashPassword(googleId + Date.now()), // random, unusable
          role: "MEMBER",
          isActive: true,
          wallet: { create: { balance: 0, currency: "IDR" } },
        },
        include: { wallet: true },
      });
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    const response = NextResponse.redirect(`${APP_URL}/#/dashboard`);

    response.cookies.set("oauth_state", "", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 0, path: "/" });
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("Google OAuth error:", err);
    return NextResponse.redirect(`${APP_URL}/#/login?error=server_error`);
  }
}
