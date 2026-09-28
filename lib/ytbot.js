const apiUrl = process.env.YTBOT_API_URL || "https://www.ytbot.com/api/v2";

export async function callYtbot(payload) {
  const params = new URLSearchParams();
  const apiKey = process.env.YTBOT_API_KEY;
  if (!apiKey) {
    throw new Error("YTBOT_API_KEY is not configured. Set it in Vercel environment variables.");
  }
  params.set("key", apiKey);

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
    throw new Error(data?.error || `YTBOT request failed with status ${response.status}`);
  }

  return data;
}

export async function getProviderServices() {
  return callYtbot({ action: "services" });
}

export async function getProviderBalance() {
  return callYtbot({ action: "balance" });
}

export async function createProviderOrder({ service, link, quantity, runs, interval }) {
  return callYtbot({ action: "add", service, link, quantity, runs, interval });
}

export async function getProviderOrderStatus(order) {
  return callYtbot({ action: "status", order });
}

export async function createProviderRefill(order) {
  return callYtbot({ action: "refill", order });
}

export async function cancelProviderOrders(orders) {
  return callYtbot({ action: "cancel", orders: Array.isArray(orders) ? orders.join(",") : orders });
}

function parseProviderResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
