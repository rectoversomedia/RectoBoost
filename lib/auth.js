import { verifyToken } from "./jwt.js";

function parseCookie(cookieHeader, name) {
  for (const part of (cookieHeader || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k.trim() === name) return v.join("=");
  }
  return null;
}

/**
 * Reads and verifies the JWT from the rb_token cookie.
 * Returns the decoded payload { userId, email, role, ... }.
 * Throws an error with status 401 if missing or invalid.
 */
export function requireAuth(request) {
  const token   = parseCookie(request.headers.get("cookie"), "rb_token");
  if (!token) {
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }

  const payload = verifyToken(token);
  if (!payload) {
    const err = new Error("Session expired or invalid — please log in again");
    err.status = 401;
    throw err;
  }

  return payload; // { userId, email, role, iat, exp }
}

/**
 * Like requireAuth but also checks for ADMIN role.
 */
export function requireAdmin(request) {
  const payload = requireAuth(request);
  if (payload.role !== "ADMIN") {
    const err = new Error("Admin access required");
    err.status = 403;
    throw err;
  }
  return payload;
}
