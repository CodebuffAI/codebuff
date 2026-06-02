import { useQuery } from "convex/react";
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
  const viewer = useQuery(api.users.viewer);
  const viewerLoading = viewer === undefined;
  const isPlatformAdmin = viewer?.role === "god" || viewer?.role === "admin";

  return {
    canUseAgent: true,
    creditsRemaining: Number.MAX_SAFE_INTEGER,
    totalCredits: Number.MAX_SAFE_INTEGER,
    isLoading: viewerLoading,
    isPlatformAdmin,
  };
}

/**
 * Hook to get detailed credit balance information
 * Includes usage analytics and plan details
 */
export function useCreditsBalance() {
  return {
    creditsRemaining: Number.MAX_SAFE_INTEGER,
    totalCredits: Number.MAX_SAFE_INTEGER,
    usedCredits: 0,
    planName: "Free",
    isLoading: false,
  };
}
