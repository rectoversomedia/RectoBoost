import { getProviderBalance } from "../../lib/smmwiz.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const providerBalance = await getProviderBalance();
    return res.status(200).json({
      provider: "smmwiz",
      balance:  providerBalance.balance,
      currency: providerBalance.currency || "USD",
    });
  } catch (err) {
    console.error("[/api/balance]", err);
    return res.status(500).json({ error: err.message });
  }
}
