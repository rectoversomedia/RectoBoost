import { json, apiError } from "../../../../lib/http.js";
import { syncSmmwizServices } from "../../../../lib/serviceCatalog.js";

export async function POST() {
  try {
    return json(await syncSmmwizServices());
  } catch (error) {
    return apiError(error);
  }
}
