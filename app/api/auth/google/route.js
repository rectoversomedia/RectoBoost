import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Use NEXT_PUBLIC_ prefix so Next.js bundles them into the server build
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://boost.rectoversomedia.com";

export async function GET(request) {
  console.log("[google-oauth] GOOGLE_CLIENT_ID:", GOOGLE_CLIENT_ID ? "SET" : "UNSET");
  if (!GOOGLE_CLIENT_ID) {
    console.log("[google-oauth] env vars:", {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? "SET" : "UNSET",
      APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    });
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 503 });
  }

  const state = Math.random().toString(36).slice(2);
  const redirectUri = `${APP_URL}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const response = NextResponse.redirect(url);
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
