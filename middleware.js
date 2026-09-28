import { NextResponse } from "next/server";

export function middleware(request) {
  const url = request.nextUrl.clone();

  // Rewrite root to SPA
  if (url.pathname === "/") {
    url.pathname = "/api/spa";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
