import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Feature flag keys - matches convex/featureFlags.ts FEATURE_FLAGS
 * Note: Most feature flags have been removed as features are now always enabled.
 * Only organizations_enabled remains as an active feature flag.
 */
export type FeatureFlagKey = "organizations_enabled";

export type RolloutStrategy =
  | "disabled"
  | "god_only"
  | "beta"
  | "percentage"
  | "enabled";

export interface UseFeatureFlagOptions {
  /**
   * Skip the query (useful for conditional execution)
   * @default false
   */
  skip?: boolean;
  /**
   * Default value to use when feature flag is not set
   * @default false
   */
  defaultValue?: boolean;
}

export interface UseFeatureFlagResult {
  /**
   * Whether the feature is enabled
   */
  enabled: boolean;
  /**
   * Whether the query is still loading
   */
  isLoading: boolean;
  /**
   * Optional description of the feature flag
   */
  description?: string;
  /**
   * The rollout strategy for this feature flag
   */
  rolloutStrategy?: RolloutStrategy;
}

/**
 * Hook to check if a feature flag is enabled
 *
 * @example
 * ```tsx
 * // Basic usage
 * const { enabled, isLoading } = useFeatureFlag("billing_enforcement");
 *
 * // With default value
 * const { enabled } = useFeatureFlag("vly_integrations_enabled", { defaultValue: false });
 *
 * // Conditional execution (skip)
 * const { enabled } = useFeatureFlag("billing_enforcement", { skip: !isGodUser });
 * ```
 */
export function useFeatureFlag(
  key: FeatureFlagKey,
  options: UseFeatureFlagOptions = {},
): UseFeatureFlagResult {
  const { skip = false, defaultValue = false } = options;

  const featureFlag = useQuery(
    api.featureFlags.checkFeature,
    skip ? "skip" : { key },
  );

  // When skipped, return default immediately
  if (skip) {
    return {
      enabled: defaultValue,
      isLoading: false,
      description: undefined,
      rolloutStrategy: undefined,
    };
  }

  const isLoading = featureFlag === undefined;
  const enabled = featureFlag?.enabled ?? defaultValue;
  const description = featureFlag?.description;
  const rolloutStrategy = featureFlag?.rollout_strategy;

  return {
    enabled,
    isLoading,
    description,
    rolloutStrategy,
  };
}
