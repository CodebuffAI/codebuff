import { Suspense } from "react";
import EarnDashboard from "@/vly/components/earn/EarnDashboard";
import { createPageMetadata } from "@/vly/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Earn | vly.ai",
  description:
    "Earn credits and rewards as an early vly.ai user through referrals and bounties.",
  path: "/web/earn",
});

export default function EarnPage() {
  return (
    <Suspense fallback={null}>
      <EarnDashboard />
    </Suspense>
  );
}
