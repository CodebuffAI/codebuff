"use client";

import { useCustomer } from "autumn-js/react";
import { type BooleanFeatureId, type AutumnCustomer } from "@/autumn/constants";
import { hasFeatureAccess } from "@/autumn/helpers";

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
  const { customer, isLoading: isCustomerLoading } = useCustomer();

  // Check feature access directly from customer object
  // This properly checks customer.features[featureId]?.has_access === true
  const hasAccess = hasFeatureAccess(customer, featureId);

  return {
    hasAccess,
    isLoading: isCustomerLoading,
    customer: customer as AutumnCustomer | null,
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
  const { customer, isLoading: isCustomerLoading } = useCustomer();

  // Check feature access directly from customer object for each feature
  const featureResults = featureIds.map((featureId) => {
    return {
      featureId,
      hasAccess: hasFeatureAccess(customer, featureId),
    };
  });

  const hasAllAccess = featureResults.every((result) => result.hasAccess);
  const hasAnyAccess = featureResults.some((result) => result.hasAccess);
  const missingFeatures = featureResults
    .filter((result) => !result.hasAccess)
    .map((result) => result.featureId);

  return {
    hasAllAccess,
    hasAnyAccess,
    missingFeatures,
    isLoading: isCustomerLoading,
    customer: customer as AutumnCustomer | null,
  };
}
