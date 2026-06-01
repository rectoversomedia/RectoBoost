import { getPaymentChannels } from "../../../lib/tripay.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const channels = await getPaymentChannels();
    return res.status(200).json({ channels });
  } catch (err) {
    console.error("[GET /api/payment/channels]", err);
    return res.status(500).json({ error: err.message });
  }
}
