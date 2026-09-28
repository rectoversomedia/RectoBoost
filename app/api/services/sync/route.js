import { json, apiError } from "../../../../lib/http.js";
import { requireAuth, requireAdmin } from "../../../../lib/auth.js";
import { syncSmmwizServices, syncYtbotServices, syncAllProviders } from "../../../../lib/serviceCatalog.js";

export async function POST(request) {
  try {
    requireAdmin(request);

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");
    const all = searchParams.get("all");

    if (all === "true") {
      const results = await syncAllProviders();
      return json({ success: true, results });
    }

    if (provider === "ytbot") {
      return json(await syncYtbotServices());
    }

    // Default: sync smmwiz
    return json(await syncSmmwizServices());
  } catch (error) {
    return apiError(error);
  }
}
