import { Suspense } from "react";
import EarnDashboard from "@/components/earn/EarnDashboard";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Earn | vly.ai",
  description:
    "Earn credits and rewards as an early vly.ai user through referrals and bounties.",
  path: "/earn",
});

export default function EarnPage() {
  return (
    <Suspense fallback={null}>
      <EarnDashboard />
    </Suspense>
  );
}
