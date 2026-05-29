import crypto from "node:crypto";
import { requireEnv } from "./env.js";

const endpoints = {
  sandbox: "https://api-sandbox.duitku.com/api/merchant",
  production: "https://api-prod.duitku.com/api/merchant"
};

function duitkuBaseUrl() {
  const mode = process.env.DUITKU_ENV || "sandbox";
  return process.env.DUITKU_API_URL || endpoints[mode] || endpoints.sandbox;
}

function merchantCode() {
  return requireEnv("DUITKU_MERCHANT_CODE");
}

function apiKey() {
  return requireEnv("DUITKU_API_KEY");
}

function hmacSha256(value) {
  return crypto.createHmac("sha256", apiKey()).update(value).digest("hex");
}

export function createInvoiceSignature(timestamp) {
  return hmacSha256(`${merchantCode()}${timestamp}`);
}

export function createStatusSignature(merchantOrderId) {
  return hmacSha256(`${merchantCode()}${merchantOrderId}`);
}

export function verifyCallbackSignature(payload) {
  const amount = payload.amount || payload.paymentAmount;
  const merchantOrderId = payload.merchantOrderId;
  const signature = payload.signature;
  if (!amount || !merchantOrderId || !signature) return false;
  return hmacSha256(`${merchantCode()}${amount}${merchantOrderId}`) === signature;
}

export async function createDuitkuTransaction({
  amount,
  paymentMethod = "",
  merchantOrderId,
  productDetails,
  customerName,
  email,
  phoneNumber = "",
  callbackUrl,
  returnUrl,
  expiryPeriod = 60,
  itemDetails = []
}) {
  const paymentAmount = Number(amount);
  if (!Number.isInteger(paymentAmount) || paymentAmount <= 0) {
    throw new Error("Valid payment amount is required");
  }

  const payload = {
    paymentAmount,
    paymentMethod,
    merchantOrderId,
    productDetails,
    additionalParam: "",
    merchantUserInfo: email,
    customerVaName: customerName || "RectoBoost Member",
    email,
    phoneNumber,
    callbackUrl,
    returnUrl,
    expiryPeriod
  };

  if (itemDetails.length) payload.itemDetails = itemDetails;

  const timestamp = String(Date.now());
  const response = await fetch(`${duitkuBaseUrl()}/createInvoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-duitku-timestamp": timestamp,
      "x-duitku-signature": createInvoiceSignature(timestamp),
      "x-duitku-merchantcode": merchantCode()
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.statusCode !== "00") {
    throw new Error(data.statusMessage || data.Message || "Duitku transaction request failed");
  }

  return data;
}

export async function checkDuitkuTransaction(merchantOrderId) {
  const params = {
    merchantCode: merchantCode(),
    merchantOrderId,
    signature: createStatusSignature(merchantOrderId)
  };

  const response = await fetch(`${duitkuBaseUrl()}/transactionStatus`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.statusMessage || data.Message || "Duitku status check failed");
  }

  return data;
}

export function mapDuitkuStatus(code) {
  if (code === "00") return "PAID";
  if (code === "01") return "PENDING";
  if (code === "02") return "FAILED";
  return "PENDING";
}
