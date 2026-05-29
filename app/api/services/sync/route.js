import { json, apiError } from "../../../../lib/http.js";
import { syncSmmwizServices } from "../../../../lib/serviceCatalog.js";

export async function POST(request) {
  try {
    const syncSecret = process.env.SYNC_SECRET;
    if (syncSecret) {
      const headerSecret = request.headers.get("x-sync-secret");
      if (headerSecret !== syncSecret) {
        return apiError(new Error("Unauthorized service sync"), 401);
      }
    }

    return json(await syncSmmwizServices());
  } catch (error) {
    return apiError(error);
  }
}
