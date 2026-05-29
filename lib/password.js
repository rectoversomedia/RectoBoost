import crypto from "node:crypto";

const iterations = 100000;
const keyLength = 64;
const digest = "sha512";

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("hex");
  return `pbkdf2:${iterations}:${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [method, storedIterations, salt, hash] = String(storedHash || "").split(":");
  if (method !== "pbkdf2" || !storedIterations || !salt || !hash) return false;

  const check = crypto
    .pbkdf2Sync(password, salt, Number(storedIterations), keyLength, digest)
    .toString("hex");

  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}
