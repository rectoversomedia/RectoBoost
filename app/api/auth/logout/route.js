import { clearAuthCookie } from "../../../../lib/http.js";

export async function POST() {
  return clearAuthCookie();
}
