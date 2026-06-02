import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPassword } from "./lib/password.js";
import crypto from "node:crypto";
import dns from "node:dns";

// Force IPv4 for all outbound connections (Tripay + Supabase whitelist)
dns.setDefaultResultOrder("ipv4first");

const rootDir = fileURLToPath(new URL(".", import.meta.url));
loadEnv();

const { prisma }              = await import("./lib/db.js");
const { sendPasswordResetEmail, sendWelcomeEmail } = await import("./lib/mailer.js");
const { callSmmwiz, getProviderBalance, getProviderOrderStatus } = await import("./lib/smmwiz.js");
const { syncSmmwizServices, listPublicServices } = await import("./lib/serviceCatalog.js");
const { getPlatform, groupServicesByPlatform, PLATFORM_META, PLATFORM_ORDER, isBlockedService } = await import("./lib/categories.js");
const { calculateRetailPrice } = await import("./lib/pricing.js");
const { quoteOrder, createPaidOrder } = await import("./lib/orders.js");
const { createTransaction, getPaymentChannels, getTransactionDetail, verifyWebhookSignature, mapTripayStatus } = await import("./lib/tripay.js");
const { signToken, verifyToken } = await import("./lib/jwt.js");
const { authLimiter, forgotLimiter, paymentLimiter } = await import("./lib/rateLimit.js");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

function calcTopupBonus(amount) {
  if (amount >= 2000000) return Math.round(amount * 0.07);
  if (amount >= 1000000) return Math.round(amount * 0.06);
  if (amount >= 500000)  return Math.round(amount * 0.05);
  if (amount >= 200000)  return Math.round(amount * 0.04);
  if (amount >= 100000)  return Math.round(amount * 0.03);
  return Math.round(amount * 0.02);
}

const COOKIE_MAX_AGE = 7 * 24 * 3600;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg":  "image/svg+xml; charset=utf-8",
  ".ico":  "image/x-icon",
  ".woff2": "font/woff2",
  ".woff":  "font/woff",
};

const STATUS_MAP = {
  Pending:       "PENDING",
  Processing:    "PROCESSING",
  "In progress": "IN_PROGRESS",
  Partial:       "PARTIAL",
  Completed:     "COMPLETED",
  Canceled:      "CANCELED",
  Cancelled:     "CANCELED",
};

const server = createServer(async (req, res) => {
  try {
    const url    = new URL(req.url, `http://${req.headers.host}`);
    const path   = url.pathname;
    const method = req.method.toUpperCase();

    // ── Auth ──────────────────────────────────────────────────
    if (path === "/api/auth/login"             && method === "POST") return await handleAuthLogin(req, res);
    if (path === "/api/auth/register"          && method === "POST") return await handleAuthRegister(req, res);
    if (path === "/api/auth/logout"            && method === "POST") return handleAuthLogout(req, res);
    if (path === "/api/auth/forgot"            && method === "POST") return await handleAuthForgot(req, res);
    if (path === "/api/auth/reset"             && method === "POST") return await handleAuthReset(req, res);
    if (path === "/api/auth/me"                && method === "GET")  return await handleAuthMe(req, res);
    if (path === "/api/auth/google"            && method === "GET")  return handleGoogleRedirect(req, res);
    if (path === "/api/auth/google/callback"   && method === "GET")  return await handleGoogleCallback(req, res, url);

    // ── Services (public) ─────────────────────────────────────
    if (path === "/api/services" && method === "GET") return await handleServices(req, res, url);

    // ── Provider balance (internal) ───────────────────────────
    if (path === "/api/balance" && method === "GET") return await handleBalance(req, res);

    // ── Sync ──────────────────────────────────────────────────
    if (path === "/api/sync" && method === "POST") {
      const secret = process.env.SYNC_SECRET || "";
      if (secret && req.headers["x-sync-secret"] !== secret) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
      try {
        const r = await syncSmmwizServices();
        return sendJson(res, 200, { ok: true, synced: r.count, usdIdrRate: r.usdIdrRate, syncedAt: new Date() });
      } catch (e) { return sendJson(res, 500, { error: e.message }); }
    }

    // ── Orders ────────────────────────────────────────────────
    if (path === "/api/orders") {
      if (method === "GET")  return await handleOrdersList(req, res, url);
      if (method === "POST") return await handleOrderCreate(req, res);
    }
    if (path === "/api/orders/status" && method === "POST") return await handleOrderStatus(req, res);
    if (path === "/api/orders/delete" && method === "POST") return await handleOrderDelete(req, res);
    if (path === "/api/orders/refill" && method === "POST") return await handleOrderRefill(req, res);

    // ── Payment ───────────────────────────────────────────────
    if (path === "/api/payment/status" && method === "GET") {
      return await handlePaymentStatus(req, res, url);
    }

    if (path === "/api/payment/channels" && method === "GET") {
      try { return sendJson(res, 200, { channels: await getPaymentChannels() }); }
      catch (e) { return sendJson(res, 500, { error: e.message }); }
    }
    if (path === "/api/payment/create"  && method === "POST") return await handlePaymentCreate(req, res);
    if (path === "/api/payment/topup"   && method === "POST") return await handlePaymentTopup(req, res);
    if (path === "/api/payment/webhook" && method === "POST") return await handlePaymentWebhook(req, res);

    // ── Admin ─────────────────────────────────────────────────
    if (path === "/api/admin/stats" && method === "GET") return await handleAdminStats(req, res);

    // ── Legacy SMMWIZ proxy ───────────────────────────────────
    if (path.startsWith("/api/smmwiz")) return await handleSmmwizProxy(req, res, url);

    // ── Static files ──────────────────────────────────────────
    serveStatic(path, res);
  } catch (error) {
    console.error("Unhandled error:", error);
    sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`RectoBoost: http://${HOST}:${PORT}`);
});

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getClientIp(req) {
  return (
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function requireAuth(req) {
  const cookie = req.headers.cookie || "";
  let token = null;
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k.trim() === "rb_token") { token = v.join("="); break; }
  }
  if (!token) {
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }
  const payload = verifyToken(token);
  if (!payload) {
    const err = new Error("Session expired — silakan login kembali");
    err.status = 401;
    throw err;
  }
  return payload; // { userId, email, role }
}

function setAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie",
    `rb_token=${token}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`
  );
}

function clearAuthCookieHeader(res) {
  res.setHeader("Set-Cookie", "rb_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleAuthLogin(req, res) {
  const ip = getClientIp(req);
  const rl = authLimiter(`login:${ip}`);
  if (!rl.allowed) return sendJson(res, 429, { error: `Terlalu banyak percobaan — coba lagi dalam ${rl.retryAfter}s` });

  const body     = await readJson(req);
  const email    = String(body.email    || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) return sendJson(res, 400, { error: "Email dan password wajib diisi" });

  const user = await prisma.user.findUnique({ where: { email }, include: { wallet: true } });
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    return sendJson(res, 401, { error: "Email atau password salah" });
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  setAuthCookie(res, token);

  sendJson(res, 200, {
    authenticated: true,
    user: {
      id:       user.id,
      email:    user.email,
      fullName: user.fullName,
      username: user.username,
      role:     user.role,
      balance:  user.wallet?.balance  || 0,
      currency: user.wallet?.currency || "IDR",
    },
  });
}

async function handleAuthRegister(req, res) {
  const ip = getClientIp(req);
  const rl = authLimiter(`register:${ip}`);
  if (!rl.allowed) return sendJson(res, 429, { error: `Terlalu banyak percobaan — coba lagi dalam ${rl.retryAfter}s` });

  const { hashPassword } = await import("./lib/password.js");
  const body     = await readJson(req);
  const email    = String(body.email    || "").trim().toLowerCase();
  const password = String(body.password || "");
  const fullName = String(body.fullName || body.name || "").trim();

  if (!email || !password || !fullName) return sendJson(res, 400, { error: "Nama lengkap, email, dan password wajib diisi" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: "Format email tidak valid" });
  if (password.length < 8) return sendJson(res, 400, { error: "Password minimal 8 karakter" });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return sendJson(res, 409, { error: "Email sudah terdaftar" });

  const username = email.split("@")[0].replace(/[^a-z0-9_]/gi, "").slice(0, 20) + Math.floor(Math.random() * 1000);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      fullName,
      username,
      role:     "MEMBER",
      isActive: true,
      wallet:   { create: { balance: 0, currency: "IDR" } },
    },
    include: { wallet: true },
  });

  sendWelcomeEmail({ toEmail: user.email, toName: user.fullName }).catch(() => {});

  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  setAuthCookie(res, token);

  sendJson(res, 201, {
    authenticated: true,
    user: {
      id:       user.id,
      email:    user.email,
      fullName: user.fullName,
      username: user.username,
      role:     user.role,
      balance:  user.wallet?.balance  || 0,
      currency: user.wallet?.currency || "IDR",
    },
  });
}

function handleAuthLogout(req, res) {
  clearAuthCookieHeader(res);
  sendJson(res, 200, { ok: true });
}

async function handleAuthForgot(req, res) {
  const ip = getClientIp(req);
  const rl = forgotLimiter(`forgot:${ip}`);
  if (!rl.allowed) return sendJson(res, 429, { error: `Terlalu banyak percobaan — coba lagi dalam ${rl.retryAfter}s` });

  const body  = await readJson(req);
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return sendJson(res, 400, { error: "Email wajib diisi" });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return sendJson(res, 200, { ok: true, message: "Jika email terdaftar, link reset akan dikirim." });
  }

  await prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });

  const token     = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.passwordReset.create({ data: { userId: user.id, token, expiresAt } });

  sendPasswordResetEmail({ toEmail: user.email, toName: user.fullName, token }).catch((err) => {
    console.error("[forgot] Email send failed:", err.message);
  });

  sendJson(res, 200, { ok: true, message: "Jika email terdaftar, link reset akan dikirim." });
}

async function handleAuthReset(req, res) {
  const { hashPassword } = await import("./lib/password.js");
  const body     = await readJson(req);
  const token    = String(body.token    || "").trim();
  const password = String(body.password || "");

  if (!token)               return sendJson(res, 400, { error: "Token tidak valid" });
  if (password.length < 8)  return sendJson(res, 400, { error: "Password minimal 8 karakter" });

  const record = await prisma.passwordReset.findUnique({ where: { token } });
  if (!record)                       return sendJson(res, 400, { error: "Link reset tidak valid atau sudah digunakan" });
  if (record.usedAt)                 return sendJson(res, 400, { error: "Link reset sudah pernah digunakan" });
  if (record.expiresAt < new Date()) return sendJson(res, 400, { error: "Link reset sudah kadaluarsa. Minta link baru." });

  await prisma.$transaction([
    prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: hashPassword(password) } }),
  ]);

  sendJson(res, 200, { ok: true, message: "Password berhasil diubah. Silakan login." });
}

async function handleAuthMe(req, res) {
  try {
    const { userId } = requireAuth(req);
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { wallet: true } });
    if (!user || !user.isActive) return sendJson(res, 401, { error: "User tidak ditemukan" });
    sendJson(res, 200, {
      user: {
        id: user.id, email: user.email, fullName: user.fullName,
        username: user.username, role: user.role,
        balance: user.wallet?.balance || 0, currency: user.wallet?.currency || "IDR",
      },
    });
  } catch (e) {
    sendJson(res, e.status || 401, { error: e.message });
  }
}

function handleGoogleRedirect(req, res) {
  const clientId    = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return sendJson(res, 500, { error: "Google OAuth belum dikonfigurasi" });

  const appUrl      = process.env.NEXT_PUBLIC_APP_URL || `http://${HOST}:${PORT}`;
  const redirectUri = `${appUrl}/api/auth/google/callback`;
  const params      = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "openid email profile",
    access_type:   "online",
    prompt:        "select_account",
  });
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  res.end();
}

async function handleGoogleCallback(req, res, url) {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL || `http://${HOST}:${PORT}`;
  const redirectUri  = `${appUrl}/api/auth/google/callback`;

  const code  = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    res.writeHead(302, { Location: "/#/login?error=google_cancelled" });
    return res.end();
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) throw new Error("Token exchange failed");

    // Get Google user info
    const infoRes  = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const gUser = await infoRes.json();
    if (!gUser.email) throw new Error("Could not get email from Google");

    const { hashPassword } = await import("./lib/password.js");

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email: gUser.email }, include: { wallet: true } });
    if (!user) {
      const username = gUser.email.split("@")[0].replace(/[^a-z0-9_]/gi, "").slice(0, 20) + Math.floor(Math.random() * 1000);
      user = await prisma.user.create({
        data: {
          email:        gUser.email,
          passwordHash: hashPassword(crypto.randomBytes(32).toString("hex")), // random — Google users login via OAuth
          fullName:     gUser.name || gUser.email.split("@")[0],
          username,
          role:         "MEMBER",
          isActive:     true,
          wallet:       { create: { balance: 0, currency: "IDR" } },
        },
        include: { wallet: true },
      });
      sendWelcomeEmail({ toEmail: user.email, toName: user.fullName }).catch(() => {});
    }

    if (!user.isActive) {
      res.writeHead(302, { Location: "/#/login?error=account_disabled" });
      return res.end();
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    setAuthCookie(res, token);
    res.writeHead(302, { Location: "/#/dashboard" });
    res.end();
  } catch (e) {
    console.error("[google-callback]", e.message);
    res.writeHead(302, { Location: "/#/login?error=google_failed" });
    res.end();
  }
}

async function handleBalance(req, res) {
  try {
    const { userId } = requireAuth(req);
    const [wallet, providerBalance] = await Promise.all([
      prisma.wallet.findUnique({ where: { userId } }),
      getProviderBalance().catch(() => null),
    ]);
    sendJson(res, 200, {
      balance:  wallet?.balance  || 0,
      currency: wallet?.currency || "IDR",
      ...(providerBalance && { providerBalance: { provider: "smmwiz", ...providerBalance } }),
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
}

async function handleServices(req, res, url) {
  try {
    const { platform, search, grouped } = Object.fromEntries(url.searchParams);
    let dbServices = await prisma.service.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }], take: 10000 });

    if (!dbServices.length) {
      const liveServices = await listPublicServices();
      return sendJson(res, 200, { total: liveServices.length, services: liveServices });
    }

    let services = dbServices
      .filter((svc) => !isBlockedService(svc))
      .map((svc) => ({
        id:         svc.providerServiceId,
        name:       svc.name,
        category:   svc.category,
        platform:   getPlatform(svc.category || ""),
        type:       svc.type,
        min:        svc.min,
        max:        svc.max,
        refill:     svc.refill,
        cancel:     svc.cancel,
        pricePer1k: svc.retailPricePer1k,
        currency:   "IDR",
      }));

    if (platform && platform !== "all") services = services.filter((s) => s.platform === platform);
    if (search) {
      const q = search.toLowerCase();
      services = services.filter((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
    }

    if (grouped === "1" || grouped === "true") {
      const groups = groupServicesByPlatform(services);
      const platformSummary = PLATFORM_ORDER
        .filter((p) => groups[p]?.length > 0)
        .map((p) => ({
          platform: p,
          label:    PLATFORM_META[p]?.label || p,
          icon:     PLATFORM_META[p]?.icon  || "⭐",
          color:    PLATFORM_META[p]?.color || "#6B7280",
          count:    groups[p].length,
        }));
      return sendJson(res, 200, { total: services.length, platforms: platformSummary, groups });
    }

    sendJson(res, 200, { total: services.length, services });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleOrdersList(req, res, url) {
  try {
    const { userId: authUserId } = requireAuth(req);
    const { status, limit = "50", offset = "0" } = Object.fromEntries(url.searchParams);

    const where = { userId: authUserId };
    if (status) where.status = status.toUpperCase();

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take:    Number(limit),
        skip:    Number(offset),
        include: { service: { select: { name: true, category: true, providerServiceId: true } } },
      }),
      prisma.order.count({ where }),
    ]);

    sendJson(res, 200, {
      total,
      orders: orders.map((o) => ({
        id:              o.publicId,
        serviceId:       o.service?.providerServiceId,
        serviceName:     o.service?.name,
        serviceCategory: o.service?.category,
        link:            o.link,
        quantity:        o.quantity,
        charge:          o.charge,
        status:          o.status,
        providerOrderId: o.providerOrderId,
        createdAt:       o.createdAt,
        updatedAt:       o.updatedAt,
      })),
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
}

async function handleOrderCreate(req, res) {
  try {
    const { userId } = requireAuth(req);
    const { action, serviceId, quantity, link, paymentId, runs, interval } = await readJson(req);
    if (!serviceId || !quantity) return sendJson(res, 400, { error: "serviceId and quantity required" });

    if (action === "quote" || !paymentId) {
      const quote = await quoteOrder({ serviceId, quantity });
      return sendJson(res, 200, { quote: true, serviceId, quantity, pricing: quote.pricing, usdIdrRate: quote.usdIdrRate });
    }

    // Verify payment belongs to this user
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment)                  return sendJson(res, 404, { error: "Payment tidak ditemukan" });
    if (payment.userId !== userId) return sendJson(res, 403, { error: "Akses ditolak" });
    if (!link)                     return sendJson(res, 400, { error: "link required for order submission" });

    const order = await createPaidOrder({ serviceId, link, quantity, paymentId, runs, interval });
    sendJson(res, 201, order);
  } catch (e) {
    const status = e.status || (e.message?.includes("not found") ? 404 : e.message?.includes("not paid") ? 402 : 500);
    sendJson(res, status, { error: e.message });
  }
}

async function handleOrderStatus(req, res) {
  try {
    const { userId } = requireAuth(req);
    const { orderId } = await readJson(req);
    if (!orderId) return sendJson(res, 400, { error: "orderId required" });

    const order = await prisma.order.findUnique({ where: { publicId: orderId } });
    if (!order)                  return sendJson(res, 404, { error: "Order not found" });
    if (order.userId !== userId) return sendJson(res, 403, { error: "Akses ditolak" });
    if (!order.providerOrderId)  return sendJson(res, 200, { orderId, status: order.status, rawStatus: order.rawStatus });

    const prov = await getProviderOrderStatus(order.providerOrderId);
    const normalizedStatus = STATUS_MAP[prov.status] || order.status;
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status:     normalizedStatus,
        rawStatus:  prov.status,
        startCount: prov.start_count != null ? Number(prov.start_count) : undefined,
        remains:    prov.remains    != null ? Number(prov.remains)    : undefined,
      },
    });
    sendJson(res, 200, { orderId, providerOrderId: order.providerOrderId, status: normalizedStatus, rawStatus: prov.status, startCount: prov.start_count, remains: prov.remains });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
}

async function handleOrderDelete(req, res) {
  try {
    const { userId } = requireAuth(req);
    const { orderId } = await readJson(req);
    if (!orderId) return sendJson(res, 400, { error: "orderId required" });

    const order = await prisma.order.findUnique({ where: { publicId: orderId } });
    if (!order)                  return sendJson(res, 404, { error: "Order not found" });
    if (order.userId !== userId) return sendJson(res, 403, { error: "Akses ditolak" });

    const deletable = ["PENDING", "COMPLETED", "CANCELED", "FAILED", "PARTIAL"];
    if (!deletable.includes(order.status)) return sendJson(res, 400, { error: "Cannot delete an order that is currently processing" });

    await prisma.order.delete({ where: { id: order.id } });
    sendJson(res, 200, { ok: true, deleted: orderId });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
}

async function handleOrderRefill(req, res) {
  try {
    const { userId } = requireAuth(req);
    const { orderId } = await readJson(req);
    if (!orderId) return sendJson(res, 400, { error: "orderId required" });

    const order = await prisma.order.findUnique({ where: { publicId: orderId } });
    if (!order)                  return sendJson(res, 404, { error: "Order not found" });
    if (order.userId !== userId) return sendJson(res, 403, { error: "Akses ditolak" });
    if (!order.providerOrderId)  return sendJson(res, 400, { error: "No provider order ID — refill not available" });

    const { createProviderRefill } = await import("./lib/smmwiz.js");
    const result = await createProviderRefill(order.providerOrderId);
    sendJson(res, 200, { ok: true, orderId, refill: result });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
}

async function handlePaymentStatus(req, res, url) {
  try {
    const { userId } = requireAuth(req);
    const paymentId = url.searchParams.get("paymentId");
    if (!paymentId) return sendJson(res, 400, { error: "paymentId required" });

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment)                  return sendJson(res, 404, { error: "Payment tidak ditemukan" });
    if (payment.userId !== userId) return sendJson(res, 403, { error: "Akses ditolak" });

    // If not yet confirmed, ask Tripay live — webhook may be delayed
    if (payment.status !== "PAID" && payment.status !== "EXPIRED" && payment.providerPaymentId) {
      try {
        const detail    = await getTransactionDetail(payment.providerPaymentId);
        const liveStatus = mapTripayStatus(detail.status);

        if (liveStatus !== payment.status) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: liveStatus,
              paidAt: liveStatus === "PAID" && detail.paid_at ? new Date(detail.paid_at * 1000) : undefined,
            },
          });

          // Credit wallet immediately if TOPUP and just confirmed PAID
          if (liveStatus === "PAID") {
            const meta = payment.metadata || {};
            if (meta.type === "TOPUP") {
              const existing = await prisma.walletTransaction.findFirst({
                where: { reference: payment.providerPaymentId, type: "TOPUP", status: "SUCCESS" },
              });
              if (!existing) {
                const credit = Number(payment.amount) + Number(meta.bonusAmount || 0);
                await prisma.$transaction([
                  prisma.wallet.upsert({
                    where:  { userId: payment.userId },
                    update: { balance: { increment: credit } },
                    create: { userId: payment.userId, balance: credit, currency: "IDR" },
                  }),
                  prisma.walletTransaction.create({
                    data: {
                      userId:    payment.userId,
                      type:      "TOPUP",
                      status:    "SUCCESS",
                      amount:    credit,
                      currency:  "IDR",
                      reference: payment.providerPaymentId,
                      note:      `Top up via ${payment.method} — manual verify`,
                    },
                  }),
                ]);
                console.log(`[payment-status] Wallet credited via manual check: user=${userId} amount=${credit}`);
              }
            }
          }
        }
      } catch (tripayErr) {
        // Non-fatal: just return DB status if Tripay unreachable
        console.warn("[payment-status] Tripay live check failed:", tripayErr.message);
      }
    }

    // Re-read fresh values after possible update
    const [fresh, wallet] = await Promise.all([
      prisma.payment.findUnique({ where: { id: paymentId } }),
      prisma.wallet.findUnique({ where: { userId } }),
    ]);

    sendJson(res, 200, {
      status:  fresh.status,
      paidAt:  fresh.paidAt,
      amount:  fresh.amount,
      balance: wallet?.balance || 0,
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
}

async function handlePaymentCreate(req, res) {
  try {
    const { userId } = requireAuth(req);

    const ip = getClientIp(req);
    const rl = paymentLimiter(`payment:${userId}:${ip}`);
    if (!rl.allowed) return sendJson(res, 429, { error: `Terlalu banyak request — coba lagi dalam ${rl.retryAfter}s` });

    const { serviceId, quantity, paymentMethod, link = "" } = await readJson(req);
    if (!serviceId || !quantity || !paymentMethod) {
      return sendJson(res, 400, { error: "serviceId, quantity, paymentMethod wajib diisi" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { wallet: true } });
    if (!user || !user.isActive) return sendJson(res, 404, { error: "User tidak ditemukan" });

    const { pricing, service } = await quoteOrder({ serviceId, quantity });
    const amount      = pricing.customerPriceIdr;
    const merchantRef = `RB-${Date.now()}-${userId.slice(-6)}`;
    const appUrl      = process.env.NEXT_PUBLIC_APP_URL || `http://${HOST}:${PORT}`;

    const tripayTx = await createTransaction({
      method:        paymentMethod,
      merchantRef,
      amount,
      customerName:  user.fullName,
      customerEmail: user.email,
      orderItems:    [{ name: `RectoBoost — ${service.name}`, price: amount, quantity: 1 }],
      returnUrl:     `${appUrl}/#/orders`,
      callbackUrl:   `${appUrl}/api/payment/webhook`,
    });

    const payment = await prisma.payment.create({
      data: {
        userId,
        provider:          "tripay",
        providerPaymentId: tripayTx.reference,
        status:            "PENDING",
        amount,
        fee:               tripayTx.total_fee || 0,
        currency:          "IDR",
        method:            paymentMethod,
        invoiceUrl:        tripayTx.checkout_url,
        expiredAt:         tripayTx.expired_time ? new Date(tripayTx.expired_time * 1000) : null,
        metadata:          { merchantRef, serviceId, quantity, link },
      },
    });

    sendJson(res, 201, {
      paymentId:   payment.id,
      merchantRef,
      amount,
      method:      paymentMethod,
      checkoutUrl: tripayTx.checkout_url,
      reference:   tripayTx.reference,
      expiredAt:   payment.expiredAt,
      qrString:    tripayTx.qr_string || null,
      payCode:     tripayTx.pay_code  || null,
      payUrl:      tripayTx.pay_url   || null,
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
}

async function handlePaymentTopup(req, res) {
  try {
    const { userId } = requireAuth(req);

    const ip = getClientIp(req);
    const rl = paymentLimiter(`topup:${userId}:${ip}`);
    if (!rl.allowed) return sendJson(res, 429, { error: `Terlalu banyak request — coba lagi dalam ${rl.retryAfter}s` });

    const { amount, paymentMethod } = await readJson(req);
    if (!amount || !paymentMethod) return sendJson(res, 400, { error: "amount dan paymentMethod wajib diisi" });

    const totalAmount = Number(amount);
    if (!Number.isInteger(totalAmount) || totalAmount < 10000) {
      return sendJson(res, 400, { error: "Minimum topup adalah IDR 10.000" });
    }
    // Bonus calculated server-side — never trusted from client
    const bonusAmount = calcTopupBonus(totalAmount);

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { wallet: true } });
    if (!user || !user.isActive) return sendJson(res, 404, { error: "User tidak ditemukan" });

    const merchantRef = `TOPUP-${Date.now()}-${userId.slice(-6)}`;
    const appUrl      = process.env.NEXT_PUBLIC_APP_URL || "https://boost.rectoversomedia.com";

    const tripayTx = await createTransaction({
      method:        paymentMethod,
      merchantRef,
      amount:        totalAmount,
      customerName:  user.fullName,
      customerEmail: user.email,
      orderItems:    [{ name: `RectoBoost Top Up — IDR ${totalAmount.toLocaleString("id")}`, price: totalAmount, quantity: 1 }],
      returnUrl:   `${appUrl}/#/add-funds/success`,
      callbackUrl: `${appUrl}/api/payment/webhook`,
    });

    const payment = await prisma.payment.create({
      data: {
        userId,
        provider:          "tripay",
        providerPaymentId: tripayTx.reference,
        status:            "PENDING",
        amount:            totalAmount,
        fee:               tripayTx.total_fee || 0,
        currency:          "IDR",
        method:            paymentMethod,
        invoiceUrl:        tripayTx.checkout_url,
        expiredAt:         tripayTx.expired_time ? new Date(tripayTx.expired_time * 1000) : null,
        metadata:          { type: "TOPUP", merchantRef, bonusAmount: Number(bonusAmount) },
      },
    });

    sendJson(res, 201, {
      paymentId:   payment.id,
      merchantRef,
      amount:      totalAmount,
      method:      paymentMethod,
      checkoutUrl: tripayTx.checkout_url,
      reference:   tripayTx.reference,
      expiredAt:   payment.expiredAt,
      qrString:    tripayTx.qr_string || null,
      payCode:     tripayTx.pay_code  || null,
      payUrl:      tripayTx.pay_url   || null,
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
}

async function handlePaymentWebhook(req, res) {
  try {
    const rawBody      = await readRaw(req);
    const callbackSign = req.headers["x-callback-signature"] || "";
    const expectedSign = verifyWebhookSignature(rawBody);

    const sigA = Buffer.from(callbackSign, "hex");
    const sigB = Buffer.from(expectedSign, "hex");
    const sigValid = sigA.length === sigB.length && sigA.length > 0 && crypto.timingSafeEqual(sigA, sigB);
    if (!sigValid) {
      console.warn("[webhook] Invalid signature");
      return sendJson(res, 401, { error: "Invalid signature" });
    }

    const payload = JSON.parse(rawBody);
    const { reference, status, paid_at } = payload;
    if (!reference) return sendJson(res, 400, { error: "Missing reference" });

    const payment = await prisma.payment.findFirst({ where: { providerPaymentId: reference } });
    if (!payment) return sendJson(res, 200, { message: "Ignored" });

    const newStatus = mapTripayStatus(status);

    // Idempotency guard
    if (payment.paidAt && newStatus === "PAID") {
      return sendJson(res, 200, { success: true, idempotent: true });
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status:   newStatus,
        paidAt:   newStatus === "PAID" && paid_at ? new Date(paid_at * 1000) : undefined,
        metadata: { ...payment.metadata, tripayCallback: payload },
      },
    });

    if (newStatus === "PAID" && updatedPayment.metadata) {
      const meta = updatedPayment.metadata;

      // TOPUP — kredit ke wallet
      if (meta.type === "TOPUP") {
        try {
          const topupCredit = Number(payment.amount) + Number(meta.bonusAmount || 0);
          await prisma.$transaction([
            prisma.wallet.upsert({
              where:  { userId: payment.userId },
              update: { balance: { increment: topupCredit } },
              create: { userId: payment.userId, balance: topupCredit, currency: "IDR" },
            }),
            prisma.walletTransaction.create({
              data: {
                userId:    payment.userId,
                type:      "TOPUP",
                status:    "SUCCESS",
                amount:    topupCredit,
                currency:  "IDR",
                reference: payment.providerPaymentId,
                note:      `Top up via ${payment.method} — Ref: ${meta.merchantRef}`,
              },
            }),
          ]);
          console.log(`[webhook] Wallet topped up: user=${payment.userId} amount=${topupCredit}`);
        } catch (err) {
          console.error("[webhook] Wallet topup failed:", err.message);
        }
        return sendJson(res, 200, { success: true });
      }

      // ORDER — kirim ke SMMWIZ
      if (meta.serviceId && meta.quantity) {
        try {
          await createPaidOrder({ serviceId: meta.serviceId, link: meta.link || "", quantity: meta.quantity, paymentId: payment.id });
        } catch (err) {
          console.error("[webhook] Order auto-submit failed:", err.message);
        }
      }
    }

    sendJson(res, 200, { success: true });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleAdminStats(req, res) {
  try {
    const { role } = requireAuth(req);
    if (role !== "ADMIN") return sendJson(res, 403, { error: "Admin access required" });

    const [totalUsers, totalServices, totalOrders, revenueAgg, providerBalance, recentOrders, ordersByStatus] =
      await Promise.all([
        prisma.user.count(),
        prisma.service.count({ where: { isActive: true } }),
        prisma.order.count(),
        prisma.order.aggregate({ _sum: { charge: true, providerCostIdr: true, profitIdr: true } }),
        getProviderBalance().catch(() => ({ balance: "N/A", currency: "USD" })),
        prisma.order.findMany({
          orderBy: { createdAt: "desc" },
          take:    10,
          include: {
            user:    { select: { fullName: true, email: true } },
            service: { select: { name: true, category: true } },
          },
        }),
        prisma.order.groupBy({ by: ["status"], _count: { status: true } }),
      ]);

    sendJson(res, 200, {
      users:           totalUsers,
      activeServices:  totalServices,
      totalOrders,
      revenue:         { amount: revenueAgg._sum.charge          || 0, currency: "IDR" },
      providerCost:    { amount: revenueAgg._sum.providerCostIdr || 0, currency: "IDR" },
      profit:          { amount: revenueAgg._sum.profitIdr       || 0, currency: "IDR" },
      providerBalance: { amount: providerBalance.balance, currency: providerBalance.currency },
      ordersByStatus:  Object.fromEntries(ordersByStatus.map((r) => [r.status, r._count.status])),
      recentOrders: recentOrders.map((o) => ({
        id:        o.publicId,
        user:      o.user?.fullName || o.user?.email,
        service:   o.service?.name,
        category:  o.service?.category,
        quantity:  o.quantity,
        charge:    o.charge,
        profit:    o.profitIdr,
        status:    o.status,
        createdAt: o.createdAt,
      })),
    });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message });
  }
}

async function handleSmmwizProxy(req, res, url) {
  if (!process.env.SMMWIZ_API_KEY) return sendJson(res, 500, { error: "SMMWIZ_API_KEY not configured" });
  const body = req.method === "POST" ? await readJson(req) : {};
  const routes = {
    "/api/smmwiz/services":      { action: "services" },
    "/api/smmwiz/balance":       { action: "balance" },
    "/api/smmwiz/orders":        { action: "add",    ...body },
    "/api/smmwiz/orders/status": { action: "status", orders: Array.isArray(body.orders) ? body.orders.join(",") : body.orders },
    "/api/smmwiz/refills":       { action: "refill", order: body.order },
    "/api/smmwiz/cancel":        { action: "cancel", orders: Array.isArray(body.orders) ? body.orders.join(",") : body.orders },
  };
  const path = url.pathname;
  if (path.startsWith("/api/smmwiz/orders/") && req.method === "GET") {
    const order = path.split("/").pop();
    return sendJson(res, 200, await callSmmwiz({ action: "status", order }));
  }
  const payload = routes[path];
  if (!payload) return sendJson(res, 404, { error: "Route not found" });
  try { sendJson(res, 200, await callSmmwiz(payload)); }
  catch (e) { sendJson(res, 500, { error: e.message }); }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1_000_000) req.destroy(); });
    req.on("end",  () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1_000_000) { req.destroy(); reject(new Error("Request too large")); }
    });
    req.on("end",  () => resolve(body));
    req.on("error", reject);
  });
}

function serveStatic(pathname, res) {
  const cleanPath  = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  const filePath   = join(rootDir, "public", normalized);

  if (!filePath.startsWith(join(rootDir, "public")) || !existsSync(filePath)) {
    const fallback = join(rootDir, "public", "index.html");
    if (existsSync(fallback)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(readFileSync(fallback));
    } else {
      sendJson(res, 404, { error: "Not found" });
    }
    return;
  }

  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(readFileSync(filePath));
}

function sendJson(res, status, data) {
  if (!res.headersSent) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  }
  res.end(JSON.stringify(data));
}
