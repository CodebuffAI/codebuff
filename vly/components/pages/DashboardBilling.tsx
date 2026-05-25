"use client";

import { TabbedBillingPage } from "@/components/billing/TabbedBillingPage";
import { BillingSectionSkeleton } from "@/components/billing/BillingSkeleton";
import { StarterUpgradeAckDialog } from "@/components/billing/StarterUpgradeAckDialog";
import { Suspense, useMemo, useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { PageLayout } from "@/components/test-landing/PageLayout";
import { useCustomer } from "autumn-js/react";
import { getActivePlan } from "@/lib/billing";
import { freePlan } from "@/autumn.config";

const STORAGE_KEY = "starter_plan_acknowledged";

export default function DashboardBilling() {
  const { organization } = useOrganization();
  const { customer, isLoading: isCustomerLoading } = useCustomer({
    errorOnNotFound: false,
  });
  // Track acknowledgment state to trigger recomputation when localStorage changes
  const [acknowledgmentKey, setAcknowledgmentKey] = useState(0);

  // Compute whether dialog should be shown based on plan and acknowledgment status
  const shouldShowDialog = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (isCustomerLoading || !customer) return false;

    // Check if user is on Starter plan
    const { planId } = getActivePlan(customer?.products, customer, freePlan.id);
    const isOnStarterPlan = planId === "starter_plan";

    // Check if they've already acknowledged
    // Note: acknowledgmentKey is used to trigger recomputation when Continue is clicked
    const hasAcknowledged = localStorage.getItem(STORAGE_KEY) === "true";

    // Show dialog if on Starter plan and haven't acknowledged
    return isOnStarterPlan && !hasAcknowledged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, isCustomerLoading, acknowledgmentKey]);

  // Show dialog based on computed value (will show until acknowledged in localStorage)
  const showStarterAck = shouldShowDialog;

  return (
    <PageLayout showHome={true} showParallax={false}>
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Suspense fallback={<BillingSectionSkeleton />}>
          <TabbedBillingPage
            key={organization?.id || "personal"}
            organizationId={organization?.id}
          />
        </Suspense>
      </div>
      <StarterUpgradeAckDialog
        open={showStarterAck}
        onOpenChange={() => {
          // Dialog can be closed, but will show again on next page load if not acknowledged
          // The localStorage check in shouldShowDialog handles the "don't show after acknowledgment" case
        }}
        onContinue={() => {
          // Dialog already saves to localStorage
          // Trigger recomputation by updating acknowledgmentKey
          setAcknowledgmentKey((prev) => prev + 1);
        }}
      />
    </PageLayout>
  );
}
