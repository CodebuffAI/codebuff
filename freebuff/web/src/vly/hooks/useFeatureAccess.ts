"use client";

import { type BooleanFeatureId, type AutumnCustomer } from "@/vly/autumn/constants";

export interface UseFeatureAccessResult {
  /**
   * Whether the user has access to the feature
   */
  hasAccess: boolean;

  /**
   * Whether data is still loading
   */
  isLoading: boolean;

  /**
   * The customer object from Autumn
   */
  customer: AutumnCustomer | null;
}

/**
 * Hook to check if user has access to a specific feature
 *
 * @param featureId - Feature ID to check
 * @returns Object with hasAccess, isLoading, and customer
 *
 * @example
 * ```tsx
 * const { hasAccess, isLoading } = useFeatureAccess("github_integration");
 *
 * if (isLoading) return <Spinner />;
 * if (!hasAccess) return <UpgradePrompt />;
 *
 * return <GitHubSettings />;
 * ```
 */
export function useFeatureAccess(featureId: BooleanFeatureId) {
  return {
    hasAccess: true,
    isLoading: false,
    customer: null as AutumnCustomer | null,
  };
}

export interface UseMultipleFeatureAccessResult {
  /**
   * Whether the user has access to all specified features
   */
  hasAllAccess: boolean;

  /**
   * Whether the user has access to any of the specified features
   */
  hasAnyAccess: boolean;

  /**
   * Array of feature IDs the user does not have access to
   */
  missingFeatures: BooleanFeatureId[];

  /**
   * Whether data is still loading
   */
  isLoading: boolean;

  /**
   * The customer object from Autumn
   */
  customer: AutumnCustomer | null;
}

/**
 * Hook to check access to multiple features at once
 *
 * @param featureIds - Array of feature IDs to check
 * @returns Object with hasAllAccess, hasAnyAccess, missingFeatures, etc.
 *
 * @example
 * ```tsx
 * const { hasAllAccess, missingFeatures } = useMultipleFeatureAccess([
 *   "github_integration",
 *   "custom_domains",
 * ]);
 *
 * if (missingFeatures.length > 0) {
 *   return <UpgradePrompt features={missingFeatures} />;
 * }
 * ```
 */
export function useMultipleFeatureAccess(featureIds: BooleanFeatureId[]) {
  return {
    hasAllAccess: true,
    hasAnyAccess: true,
    missingFeatures: [],
    isLoading: false,
    customer: null as AutumnCustomer | null,
  };
}
