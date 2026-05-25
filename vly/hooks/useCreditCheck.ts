import { useCustomer } from "autumn-js/react";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { getActivePlan } from "@/autumn/helpers";
import { api } from "@/convex/_generated/api";

export interface CreditCheckResult {
  canUseAgent: boolean;
  creditsRemaining: number;
  totalCredits: number;
  isLoading: boolean;
  isPlatformAdmin: boolean;
  error?: string;
}

/**
 * Hook to check if user has sufficient credits to use the AI agent
 * Uses Autumn's check API to validate against "agent_credits" feature
 */
export function useCreditCheck(): CreditCheckResult {
  const { customer, isLoading: customerLoading } = useCustomer();
  const viewer = useQuery(api.users.viewer);
  const viewerLoading = viewer === undefined;
  const isPlatformAdmin = viewer?.role === "god" || viewer?.role === "admin";

  // Get credit information from Autumn customer data
  const creditInfo = useMemo(() => {
    if (viewerLoading) {
      return {
        creditsRemaining: 0,
        totalCredits: 0,
        isLoading: true,
      };
    }

    if (isPlatformAdmin) {
      return {
        creditsRemaining: 0,
        totalCredits: 0,
        isLoading: false,
      };
    }

    if (!customer || customerLoading) {
      return {
        creditsRemaining: 0,
        totalCredits: 0,
        isLoading: true,
      };
    }

    // Get token feature data from customer
    const tokenFeature = (customer as any)?.features?.agent_credits;
    if (!tokenFeature) {
      return {
        creditsRemaining: 0,
        totalCredits: 0,
        isLoading: false,
      };
    }

    const totalCredits = tokenFeature.included_usage || 0;
    const creditsRemaining = tokenFeature.balance || 0;

    return {
      creditsRemaining,
      totalCredits,
      isLoading: false,
    };
  }, [customer, customerLoading, isPlatformAdmin, viewerLoading]);

  // Check if user can use AI features
  const canUseAgent = isPlatformAdmin || creditInfo.creditsRemaining > 0;

  return {
    canUseAgent,
    creditsRemaining: creditInfo.creditsRemaining,
    totalCredits: creditInfo.totalCredits,
    isLoading: creditInfo.isLoading,
    isPlatformAdmin,
  };
}

/**
 * Hook to get detailed credit balance information
 * Includes usage analytics and plan details
 */
export function useCreditsBalance() {
  const { customer, isLoading: customerLoading } = useCustomer();

  return useMemo(() => {
    if (!customer || customerLoading) {
      return {
        creditsRemaining: 0,
        totalCredits: 0,
        usedCredits: 0,
        planName: "Free",
        isLoading: true,
      };
    }

    // Get credit data from Autumn customer features
    const tokenFeature = (customer as any)?.features?.agent_credits;
    const totalCredits = tokenFeature?.included_usage || 0;
    const usedCredits = tokenFeature?.usage || 0;
    const creditsRemaining = tokenFeature?.balance || 0;

    // Use shared active-plan resolver so paid users don't get mislabeled as Free
    // when multiple products are present.
    const { displayName } = getActivePlan(
      (customer as any)?.products,
      customer as any,
      "free_plan",
    );
    const planName = displayName || "Free";

    return {
      creditsRemaining,
      totalCredits,
      usedCredits,
      planName,
      isLoading: false,
    };
  }, [customer, customerLoading]);
}
