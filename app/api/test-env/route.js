import { NextResponse } from "next/server";

export async function GET() {
  const allKeys = Object.keys(process.env);
  return NextResponse.json({
    ver: "6",
    app_url: process.env.NEXT_PUBLIC_APP_URL,
    google_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    google_secret: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET ? "SET" : "UNSET",
    test_var: process.env.TEST_VAR,
    google_client_id: process.env.GOOGLE_CLIENT_ID,
    all_vercel_keys: allKeys.filter(k => k.startsWith("VERCEL") || k.startsWith("GOOGLE") || k.startsWith("NEXT_PUBLIC") || k.startsWith("TEST")),
  });
}
