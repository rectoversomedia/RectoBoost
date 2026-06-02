import { redirect } from "next/navigation";

// Serve the SPA — index.html handles all routing client-side via hash router
export default function Page() {
  redirect("/index.html");
}

