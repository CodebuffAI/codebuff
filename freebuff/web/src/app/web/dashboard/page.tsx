import { redirect } from "next/navigation";

// The projects dashboard now lives at the canonical /web route. Keep this
// path working (it's linked from many places + bookmarks) by redirecting.
export default function DashboardRedirectPage() {
  redirect("/web");
}
