import { Suspense } from "react";
import DashboardBilling from "@/vly/components/pages/DashboardBilling";
import { createPageMetadata } from "@/vly/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Pricing | vly.ai",
  description:
    "Compare vly.ai plans for building and shipping production-ready web apps.",
  path: "/web/pricing",
});

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <DashboardBilling />
    </Suspense>
  );
}
