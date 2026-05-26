/**
 * Customer & Usage Utilities
 *
 * Consolidated module for:
 * - Customer data extraction and processing
 * - Usage activity transformation
 * - Credit calculations
 */

import type { LucideIcon } from "lucide-react";
import { FEATURE_CONFIG } from "./feature-config";
import type { CustomerFeature, BooleanFeature } from "./types";
import type { AutumnCustomer } from "@/autumn/constants";

// ============================================================================
// Customer Data Extraction
// ============================================================================

/**
 * Extracted customer features with typed access
 */
export interface ExtractedFeatures {
  agent_credits?: CustomerFeature;
  emailIntegration?: CustomerFeature;
  llmIntegration?: CustomerFeature;
  convexFunctionCalls?: CustomerFeature;
  convexCompute?: CustomerFeature;
  convexDatabaseBW?: CustomerFeature;
  convexFileBW?: CustomerFeature;
  seats?: CustomerFeature;
  github_integration?: BooleanFeature;
}

/**
 * Extract all customer features with type safety
 * Provides centralized access to Autumn customer feature data
 */
export function extractCustomerFeatures(
  customer: AutumnCustomer | null | undefined,
): ExtractedFeatures {
  return {
    agent_credits: customer?.features?.agent_credits,
    emailIntegration: customer?.features?.email_integration,
    llmIntegration: customer?.features?.llm_integration,
    convexFunctionCalls: customer?.features?.convex_function_calls,
    convexCompute: customer?.features?.convex_compute,
    convexDatabaseBW: customer?.features?.convex_database_bw,
    convexFileBW: customer?.features?.convex_file_bw,
    seats: customer?.features?.seats,
    github_integration: customer?.features?.github_integration,
  };
}

/**
 * Calculate credit usage percentage
 * Returns percentage of credits used (0-100+)
 */
export function calculateCreditPercentage(
  totalCredits: number,
  remainingCredits: number,
): number {
  if (totalCredits === 0) return 0;
  return ((totalCredits - remainingCredits) / totalCredits) * 100;
}

// ============================================================================
// Usage Activity Utilities
// ============================================================================

export interface UsageActivity {
  featureId: string;
  featureName: string;
  usage: number;
  balance: number;
  icon: LucideIcon;
}

export interface FeatureWithId {
  featureId: string;
  feature: CustomerFeature | undefined;
}

/**
 * Transform customer features into usage activity entries
 * Filters and sorts features by usage amount
 */
export function transformCustomerToUsageActivity(
  customer: AutumnCustomer | null | undefined,
  options: {
    vlyIntegrationsEnabled?: boolean;
  } = {},
): UsageActivity[] {
  const { vlyIntegrationsEnabled = false } = options;
  const usageActivity: UsageActivity[] = [];

  if (!customer?.features) {
    return usageActivity;
  }

  // Build usage activity from customer features
  for (const [featureId, feature] of Object.entries(customer.features)) {
    // Skip integration features if vly_integrations_enabled flag is off
    if (
      !vlyIntegrationsEnabled &&
      (featureId === "email_integration" || featureId === "llm_integration")
    ) {
      continue;
    }

    const config = FEATURE_CONFIG[featureId];
    const featureData = feature as CustomerFeature | undefined;

    // Only include features with actual usage
    if (config && featureData?.usage && featureData.usage > 0) {
      usageActivity.push({
        featureId,
        featureName: config.name,
        usage: featureData.usage || 0,
        balance: featureData.balance || 0,
        icon: config.icon,
      });
    }
  }

  // Sort by usage (highest first)
  usageActivity.sort((a, b) => b.usage - a.usage);

  return usageActivity;
}

/**
 * Generic overage cost calculation for a single feature
 * Uses configuration from FEATURE_CONFIG instead of hardcoded prices
 */
export function calculateFeatureOverageCost(
  featureId: string,
  feature: CustomerFeature | undefined,
): number {
  const config = FEATURE_CONFIG[featureId];
  if (!config?.overagePrice || !feature?.included_usage) {
    return 0;
  }

  // "inf" or unlimited flag means unlimited, so no overage
  if (feature.unlimited === true || feature.included_usage === "inf") {
    return 0;
  }

  // Calculate consumed amount: consumed = included_usage - balance
  // balance represents what's remaining, so consumed is the difference
  const balance = feature.balance || 0;
  const usedAmount = Math.max(0, feature.included_usage - balance);

  if (usedAmount <= feature.included_usage) {
    return 0;
  }

  const overage = usedAmount - feature.included_usage;
  const billingUnit = config.overageBillingUnit ?? 1;
  return (overage / billingUnit) * config.overagePrice;
}

/**
 * Calculate total overage cost across multiple features
 * Generic replacement for calculateConvexOverageCost and calculateIntegrationOverageCost
 */
export function calculateGroupOverageCost(features: FeatureWithId[]): number {
  return features.reduce((total, { featureId, feature }) => {
    return total + calculateFeatureOverageCost(featureId, feature);
  }, 0);
}

/**
 * Calculate average usage percentage across multiple features
 * Generic replacement for calculateConvexAverageUsage and calculateIntegrationAverageUsage
 */
export function calculateGroupAverageUsage(
  features: Array<{ feature: CustomerFeature | undefined }>,
): number {
  const percentages = features
    .map(({ feature }) => {
      if (
        !feature?.included_usage ||
        feature.included_usage === 0 ||
        feature.unlimited === true ||
        feature.included_usage === "inf"
      ) {
        return null;
      }
      // Calculate consumed amount: consumed = included_usage - balance
      // balance represents what's remaining, so consumed is the difference
      const balance = feature.balance || 0;
      const usedAmount = Math.max(0, feature.included_usage - balance);
      return (usedAmount / feature.included_usage) * 100;
    })
    .filter((p): p is number => p !== null);

  if (percentages.length === 0) {
    return 0;
  }

  return percentages.reduce((a, b) => a + b, 0) / percentages.length;
}

/**
 * Calculate maximum usage percentage across multiple features
 * Returns the highest usage percentage along with the feature name
 */
export function calculateGroupMaxUsage(
  features: Array<{ featureId: string; feature: CustomerFeature | undefined }>,
): { percentage: number; featureName: string } {
  let maxPercentage = 0;
  let maxFeatureId = "";

  for (const { featureId, feature } of features) {
    if (
      !feature?.included_usage ||
      feature.included_usage === 0 ||
      feature.unlimited === true ||
      feature.included_usage === "inf"
    ) {
      continue;
    }

    // Calculate consumed amount: consumed = included_usage - balance
    const balance = feature.balance || 0;
    const usedAmount = Math.max(0, feature.included_usage - balance);
    const percentage = (usedAmount / feature.included_usage) * 100;

    if (percentage > maxPercentage) {
      maxPercentage = percentage;
      maxFeatureId = featureId;
    }
  }

  // Get the feature name from config
  const config = FEATURE_CONFIG[maxFeatureId];
  const featureName = config?.name || maxFeatureId;

  return {
    percentage: maxPercentage,
    featureName,
  };
}

/**
 * Get color classes based on usage percentage
 * Used for displaying usage levels with appropriate visual feedback
 */
export function getUsageColorClasses(percentage: number): {
  text: string;
  bg: string;
} {
  if (percentage >= 75) {
    return { text: "text-orange-700", bg: "bg-orange-100" };
  }
  if (percentage >= 50) {
    return { text: "text-yellow-700", bg: "bg-yellow-100" };
  }
  return { text: "text-green-700", bg: "bg-green-100" };
}
