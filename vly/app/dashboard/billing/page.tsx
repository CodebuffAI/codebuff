import DashboardBilling from "@/components/pages/DashboardBilling";
import { createPageMetadata } from "@/lib/site-metadata";
import { Suspense } from "react";

export const metadata = createPageMetadata({
  title: "Pricing | vly.ai",
  description:
    "Compare vly.ai plans for building and shipping production-ready web apps.",
  path: "/pricing",
  noIndex: true,
});

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <DashboardBilling />
    </Suspense>
  );
}
