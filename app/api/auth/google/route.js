import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request) {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://boost.rectoversomedia.com";

  console.log("[google-oauth] Attempting login");
  console.log("[google-oauth] GOOGLE_CLIENT_ID:", googleClientId ? `SET (${googleClientId.slice(0,10)}...)` : "UNSET");

  if (!googleClientId) {
    console.log("[google-oauth] All env keys with GOOGLE:", Object.keys(process.env).filter(k => k.includes("GOOGLE")));
    console.log("[google-oauth] All env keys with CLIENT:", Object.keys(process.env).filter(k => k.includes("CLIENT")));
    return NextResponse.json({
      error: "Google OAuth not configured",
      debug: {
        googleId: googleClientId ? "SET" : "UNSET",
        googleSecret: googleClientSecret ? "SET" : "UNSET",
        appUrl,
        envKeys: Object.keys(process.env).filter(k => k.includes("VERCEL") || k.includes("GOOGLE") || k.includes("CLIENT"))
      }
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
