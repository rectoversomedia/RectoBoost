/**
 * Tripay payment gateway integration.
 * Docs: https://tripay.co.id/developer
 */

import crypto from "node:crypto";
import dns from "node:dns";

// Force IPv4 for all outgoing connections — Tripay whitelist only accepts IPv4
dns.setDefaultResultOrder("ipv4first");

const TRIPAY_API_URL = "https://tripay.co.id/api";

function apiKey() {
  return process.env.TRIPAY_API_KEY || "";
}

function privateKey() {
  return process.env.TRIPAY_PRIVATE_KEY || "";
}

function merchantCode() {
  return process.env.TRIPAY_MERCHANT_CODE || "";
}

/**
 * HMAC-SHA256 signature for creating a transaction.
 * Format: merchantCode + merchantRef + amount
 */
function createSignature(merchantRef, amount) {
  return crypto
    .createHmac("sha256", privateKey())
    .update(merchantCode() + merchantRef + String(amount))
    .digest("hex");
}

/**
 * Verify incoming webhook signature from Tripay.
 */
export function verifyWebhookSignature(rawBody) {
  const expected = crypto
    .createHmac("sha256", privateKey())
    .update(rawBody)
    .digest("hex");
  return expected;
}

/**
 * Fetch available payment channels.
 */
export async function getPaymentChannels() {
  const res = await fetch(`${TRIPAY_API_URL}/merchant/payment-channel`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to fetch Tripay payment channels");
  }
  return data.data;
}

/**
 * Create a closed (fixed-amount) transaction.
 * @param {object} opts
 * @param {string} opts.method        — Tripay payment method code (e.g. "BRIVA", "QRIS")
 * @param {string} opts.merchantRef   — your unique order ID
 * @param {number} opts.amount        — total amount in IDR
 * @param {string} opts.customerName
 * @param {string} opts.customerEmail
 * @param {string} opts.customerPhone
 * @param {Array}  opts.orderItems    — [{ name, price, quantity }]
 * @param {string} opts.returnUrl
 * @param {string} opts.callbackUrl
 * @param {number} opts.expiredTime   — unix timestamp (default: now + 24h)
 */
export async function createTransaction({
  method,
  merchantRef,
  amount,
  customerName,
  customerEmail,
  customerPhone = "",
  orderItems = [],
  returnUrl = "",
  callbackUrl = "",
  expiredTime,
}) {
  const totalAmount = Number(amount);
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    throw new Error("Valid amount (integer IDR) is required");
  }

  const payload = {
    method,
    merchant_ref:   merchantRef,
    amount:         totalAmount,
    customer_name:  customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    order_items:    orderItems.map((item) => ({
      name:     item.name,
      price:    Number(item.price),
      quantity: Number(item.quantity),
    })),
    return_url:   returnUrl,
    callback_url: callbackUrl,
    expired_time: expiredTime || Math.floor(Date.now() / 1000) + 86400,
    signature:    createSignature(merchantRef, totalAmount),
  };

  const res = await fetch(`${TRIPAY_API_URL}/transaction/create`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Tripay transaction creation failed");
  }

  return data.data;
}

/**
 * Get transaction detail by reference.
 */
export async function getTransactionDetail(reference) {
  const res = await fetch(
    `${TRIPAY_API_URL}/transaction/detail?reference=${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${apiKey()}` },
      cache: "no-store",
    }
  );
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Tripay detail fetch failed");
  }
  return data.data;
}

/**
 * Map Tripay status string to internal PaymentStatus enum.
 */
export function mapTripayStatus(status) {
  switch (String(status).toUpperCase()) {
    case "PAID":    return "PAID";
    case "UNPAID":  return "PENDING";
    case "EXPIRED": return "EXPIRED";
    case "FAILED":  return "FAILED";
    case "REFUND":  return "REFUNDED";
    default:        return "PENDING";
  }
}
