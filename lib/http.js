const COOKIE_MAX_AGE = 7 * 24 * 3600; // 7 days

export function json(data, status = 200) {
  return Response.json(data, { status });
}

export function apiError(error, status) {
  const code = status ?? error.status ?? 500;
  return json({ error: error.message || "Request failed" }, code);
}

export function jsonWithToken(data, token, status = 200) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `rb_token=${token}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie":   cookie,
    },
  });
}

export function clearAuthCookie() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie":   "rb_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax",
    },
  });
}

/** Extract client IP from request (works behind proxies) */
export function getClientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
