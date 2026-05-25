"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillingSection } from "./BillingSection";
import { PlansPricingSection } from "./PlansPricingSection";
import { Crown, CreditCard } from "lucide-react";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useOrganization, useUser } from "@clerk/nextjs";

interface TabbedBillingPageProps {
  organizationId?: string;
}

export function TabbedBillingPage({
  organizationId,
}: TabbedBillingPageProps = {}) {
  const { organization } = useOrganization();
  const { isSignedIn, isLoaded } = useUser();
  const { enabled: organizationsEnabled } = useFeatureFlag(
    "organizations_enabled",
  );

  const isOrganizationContext = organizationsEnabled && !!organizationId;

  // If user is not signed in, just show PlansPricingSection (which will show login prompt)
  if (!isLoaded) {
    return <PlansPricingSection organizationId={organizationId} />;
  }

  if (!isSignedIn) {
    return <PlansPricingSection organizationId={organizationId} />;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="plans" className="w-full">
        <TabsList className="mb-8 grid w-full grid-cols-2 rounded-lg bg-[#F9FBFD] p-1 shadow-sm">
          <TabsTrigger
            value="plans"
            className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-[#1a73e8] data-[state=active]:shadow-sm"
          >
            <Crown className="h-4 w-4" />
            Plans
          </TabsTrigger>
          <TabsTrigger
            value="billing"
            className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-[#1a73e8] data-[state=active]:shadow-sm"
          >
            <CreditCard className="h-4 w-4" />
            Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-6">
          <PlansPricingSection organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <div className="mb-6">
            <h2 className="mb-2 text-2xl font-medium text-gray-800">
              {isOrganizationContext
                ? "Team Billing Management"
                : "Billing Management"}
            </h2>
            <p className="text-gray-600">
              {isOrganizationContext
                ? `Manage ${organization?.name}'s billing, usage, and payment methods`
                : "Monitor your usage, credits, and manage payment methods"}
            </p>
          </div>
          <BillingSection organizationId={organizationId} showPlans={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
