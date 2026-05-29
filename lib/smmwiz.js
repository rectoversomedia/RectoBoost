import { requireEnv } from "./env.js";

const apiUrl = process.env.SMMWIZ_API_URL || "https://smmwiz.com/api/v2";

export async function callSmmwiz(payload) {
  const params = new URLSearchParams();
  params.set("key", requireEnv("SMMWIZ_API_KEY"));

  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store"
  });

  const text = await response.text();
  const data = parseProviderResponse(text);

  if (!response.ok || data?.error) {
    throw new Error(data?.error || `SMMWIZ request failed with status ${response.status}`);
  }

  return data;
}

export async function getProviderServices() {
  return callSmmwiz({ action: "services" });
}

export async function getProviderBalance() {
  return callSmmwiz({ action: "balance" });
}

export async function createProviderOrder({ service, link, quantity, runs, interval }) {
  return callSmmwiz({ action: "add", service, link, quantity, runs, interval });
}

export async function getProviderOrderStatus(order) {
  return callSmmwiz({ action: "status", order });
}

export async function createProviderRefill(order) {
  return callSmmwiz({ action: "refill", order });
}

export async function cancelProviderOrders(orders) {
  return callSmmwiz({ action: "cancel", orders: Array.isArray(orders) ? orders.join(",") : orders });
}

function parseProviderResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
