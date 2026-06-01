import { json, apiError } from "../../../lib/http.js";
import { requireAuth } from "../../../lib/auth.js";
import { getProviderBalance } from "../../../lib/smmwiz.js";
import { prisma } from "../../../lib/db.js";

export async function GET(request) {
  try {
    const { userId } = requireAuth(request);

    const [wallet, providerBalance] = await Promise.all([
      prisma.wallet.findUnique({ where: { userId } }),
      getProviderBalance().catch(() => null),
    ]);

    return json({
      balance:  wallet?.balance  || 0,
      currency: wallet?.currency || "IDR",
      ...(providerBalance && {
        providerBalance: { provider: "smmwiz", ...providerBalance },
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
