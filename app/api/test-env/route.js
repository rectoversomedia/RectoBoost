import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? "SET" : "UNSET",
    GOOGLE_CLIENT_SECRET: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET ? "SET" : "UNSET",
    APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    TEST_VAR: process.env.TEST_VAR ? "SET" : "UNSET",
    VER: "5",
  });
}
