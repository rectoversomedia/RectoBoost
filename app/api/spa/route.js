import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const html = readFileSync(
    join(process.cwd(), "public/index.html"),
    "utf8"
  );
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
