import { json, apiError } from "../../../../lib/http.js";
import { requireAdmin } from "../../../../lib/auth.js";
import {
  listProviders,
  updateProvider,
  ensureProvidersExist,
} from "../../../../lib/providers.js";

export async function GET(request) {
  try {
    requireAdmin(request);
    await ensureProvidersExist();
    const providers = await listProviders();
    return json({ success: true, providers });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request) {
  try {
    requireAdmin(request);
    const body = await request.json();
    const { name, enabled, priority, apiKey, apiUrl } = body;

    if (!name) {
      return apiError(new Error("Provider name wajib diisi"), 400);
    }

    const allowed = ["smmwiz", "ytbot"];
    if (!allowed.includes(name)) {
      return apiError(new Error(`Provider harus salah satu dari: ${allowed.join(", ")}`), 400);
    }

    const updated = await updateProvider({ name, enabled, priority, apiKey, apiUrl });
    return json({ success: true, provider: updated });
  } catch (error) {
    return apiError(error);
  }
}
