import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request) {
  const googleClientId = process.env.TEST_PLAIN || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://boost.rectoversomedia.com";

  if (!googleClientId) {
    return NextResponse.json({
      error: "Google OAuth not configured",
      hint: "Set GOOGLE_CLIENT_ID env var in Vercel dashboard"
    }, { status: 503 });
  }

  const state = Math.random().toString(36).slice(2);
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: googleClientId,
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
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/",
  });
  return response;
}
