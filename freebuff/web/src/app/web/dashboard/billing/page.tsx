import DashboardBilling from "@/vly/components/pages/DashboardBilling";
import { createPageMetadata } from "@/vly/lib/site-metadata";
import { Suspense } from "react";

export const metadata = createPageMetadata({
  title: "Pricing | Freebuff Web",
  description:
    "Compare Freebuff Web plans for building and shipping production-ready web apps.",
  path: "/web/pricing",
  noIndex: true,
});

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <DashboardBilling />
    </Suspense>
  );
}
