import { json, apiError } from "../../../lib/http.js";
import { listPublicServices } from "../../../lib/serviceCatalog.js";

export async function GET() {
  try {
    return json(await listPublicServices());
  } catch (error) {
    return apiError(error);
  }
}
