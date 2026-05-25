import { Suspense } from "react";
import DashboardBilling from "@/components/pages/DashboardBilling";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Pricing | vly.ai",
  description:
    "Compare vly.ai plans for building and shipping production-ready web apps.",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <DashboardBilling />
    </Suspense>
  );
}
