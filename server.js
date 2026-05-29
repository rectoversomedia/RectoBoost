import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const SMMWIZ_API_URL = process.env.SMMWIZ_API_URL || "https://smmwiz.com/api/v2";
const SMMWIZ_API_KEY = process.env.SMMWIZ_API_KEY || "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/smmwiz")) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, 500, { error: "Internal server error", detail: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`RectoBoost dashboard: http://${HOST}:${PORT}`);
});

function loadEnv() {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function handleApi(req, res, url) {
  if (!SMMWIZ_API_KEY) {
    sendJson(res, 500, {
      error: "SMMWIZ_API_KEY is not configured",
      message: "Create a .env file from .env.example and add your SMMWIZ API key."
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/smmwiz/services") {
    sendJson(res, 200, await callSmmwiz({ action: "services" }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/smmwiz/balance") {
    sendJson(res, 200, await callSmmwiz({ action: "balance" }));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/smmwiz/orders/")) {
    const order = url.pathname.split("/").pop();
    sendJson(res, 200, await callSmmwiz({ action: "status", order }));
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readJson(req);
  const routes = {
    "/api/smmwiz/orders": () => callSmmwiz({
      action: "add",
      service: body.service,
      link: body.link,
      quantity: body.quantity,
      runs: body.runs,
      interval: body.interval
    }),
    "/api/smmwiz/orders/status": () => callSmmwiz({
      action: "status",
      orders: Array.isArray(body.orders) ? body.orders.join(",") : body.orders
    }),
    "/api/smmwiz/refills": () => callSmmwiz({
      action: "refill",
      order: body.order,
      orders: Array.isArray(body.orders) ? body.orders.join(",") : body.orders
    }),
    "/api/smmwiz/refills/status": () => callSmmwiz({
      action: "refill_status",
      refill: body.refill,
      refills: Array.isArray(body.refills) ? body.refills.join(",") : body.refills
    }),
    "/api/smmwiz/cancel": () => callSmmwiz({
      action: "cancel",
      orders: Array.isArray(body.orders) ? body.orders.join(",") : body.orders
    })
  };

  const handler = routes[url.pathname];
  if (!handler) {
    sendJson(res, 404, { error: "API route not found" });
    return;
  }

  sendJson(res, 200, await handler());
}

async function callSmmwiz(payload) {
  const params = new URLSearchParams();
  params.set("key", SMMWIZ_API_KEY);

  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  const response = await fetch(SMMWIZ_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    return { error: "SMMWIZ request failed", status: response.status, data };
  }

  return data;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(pathname, res) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(rootDir, normalized);
  if (!filePath.startsWith(rootDir) || !existsSync(filePath)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const ext = extname(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  res.end(readFileSync(filePath));
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
