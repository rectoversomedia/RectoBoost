import crypto from "node:crypto";

const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const DEFAULT_EXPIRY_SEC = 7 * 24 * 3600; // 7 days

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET environment variable is not set");
  return s;
}

export function signToken(payload, expirySeconds = DEFAULT_EXPIRY_SEC) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now, exp: now + expirySeconds };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const data = `${HEADER}.${body}`;
  const sig  = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const data     = `${header}.${body}`;
    const expected = crypto.createHmac("sha256", secret()).update(data).digest("base64url");

    // Timing-safe comparison
    const sigBuf = Buffer.from(sig,      "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
