/**
 * Centralized feature configuration system
 * Maps feature IDs to their display metadata, icons, units, and pricing
 * Also includes pack configurations for top-up purchases
 */

import type { LucideIcon } from "lucide-react";
import {
  Coins,
  Mail,
  Brain,
  Rocket,
  Cpu,
  Database,
  HardDrive,
} from "lucide-react";
import { formatBytes, formatCompute } from "@/vly/lib/monitoring/monitoring-utils";
import { formatCredits } from "@/vly/autumn/helpers";
// TEMPORARILY DISABLED: All pack imports commented out due to Autumn API 500 errors
// on the /has_customers endpoint. Re-enable once Autumn resolves the issue.
// import {
//   tokenPackSmall,
//   tokenPackMedium,
//   tokenPackLarge,
//   emailCreditPackSmall,
//   emailCreditPackMedium,
//   emailCreditPackLarge,
//   aiCreditPackSmall,
//   aiCreditPackMedium,
//   aiCreditPackLarge,
//   convexFunctionCallsPackSmall,
//   convexFunctionCallsPackMedium,
//   convexFunctionCallsPackLarge,
//   convexComputePackSmall,
//   convexComputePackMedium,
//   convexComputePackLarge,
//   convexDatabaseBWPackSmall,
//   convexDatabaseBWPackMedium,
//   convexDatabaseBWPackLarge,
//   convexFileBWPackSmall,
//   convexFileBWPackMedium,
//   convexFileBWPackLarge,
// } from "@/vly/autumn.config";

// Use centralized formatCredits from autumn/web/pricing
// Alias for backwards compatibility within this file
const formatLargeNumber = formatCredits;

// ============================================================================
// Pack Configuration Types & Helpers
// ============================================================================

/**
 * Pack option for top-up purchases
 */
export interface PackOption {
  id: string;
  label: string;
  amount: string;
  price: string;
}

/**
 * Helper to convert Autumn product definition to PackOption for UI display
 * Extracts price and usage amount from product items
 */
function productToPackOption(product: any, label: string): PackOption {
  const priceItem = product.items.find((i: any) => i.price !== undefined);
  const featureItem = product.items.find(
    (i: any) => i.included_usage !== undefined,
  );

  const price = priceItem?.price || 0;
  const usage = featureItem?.included_usage || 0;

  // Auto-format amount based on feature type
  let amount = "";
  if (product.id.includes("token_pack")) {
    amount = `${(usage / 1000000).toFixed(0)}M credits`;
  } else if (product.id.includes("email_pack")) {
    amount = `${usage} emails`;
  } else if (product.id.includes("ai_pack")) {
    amount = `${usage} tokens`;
  } else if (product.id.includes("function_calls")) {
    amount = `${(usage / 1000000).toFixed(0)}M calls`;
  } else if (product.id.includes("compute")) {
    amount = `${usage} GB-h`;
  } else if (product.id.includes("_bw_")) {
    amount = `${usage} GB`;
  }

  return {
    id: product.id,
    label,
    amount,
    price: `$${price}`,
  };
}

// ============================================================================
// Pack Configurations
// ============================================================================

/**
 * Agent Credit Packs
 * Used for AI agent operations and computations
 * TEMPORARILY DISABLED: Autumn API 500 errors
 */
export const TOKEN_PACKS: PackOption[] = [
  // productToPackOption(tokenPackSmall, "Small"),
  // productToPackOption(tokenPackMedium, "Medium"),
  // productToPackOption(tokenPackLarge, "Large"),
];

/**
 * Convex Function Calls Packs
 * Backend function execution credits
 * TEMPORARILY DISABLED: Autumn API 500 errors
 */
export const CONVEX_FUNCTION_CALLS_PACKS: PackOption[] = [
  // productToPackOption(convexFunctionCallsPackSmall, "Small"),
  // productToPackOption(convexFunctionCallsPackMedium, "Medium"),
  // productToPackOption(convexFunctionCallsPackLarge, "Large"),
];

/**
 * Convex Compute Packs
 * Backend compute time (GB-hours)
 * TEMPORARILY DISABLED: Autumn API 500 errors
 */
export const CONVEX_COMPUTE_PACKS: PackOption[] = [
  // productToPackOption(convexComputePackSmall, "Small"),
  // productToPackOption(convexComputePackMedium, "Medium"),
  // productToPackOption(convexComputePackLarge, "Large"),
];

/**
 * Convex Database Bandwidth Packs
 * Database query and sync bandwidth
 * TEMPORARILY DISABLED: Autumn API 500 errors
 */
export const CONVEX_DATABASE_BW_PACKS: PackOption[] = [
  // productToPackOption(convexDatabaseBWPackSmall, "Small"),
  // productToPackOption(convexDatabaseBWPackMedium, "Medium"),
  // productToPackOption(convexDatabaseBWPackLarge, "Large"),
];

/**
 * Convex File Bandwidth Packs
 * File storage and transfer bandwidth
 * TEMPORARILY DISABLED: Autumn API 500 errors
 */
export const CONVEX_FILE_BW_PACKS: PackOption[] = [
  // productToPackOption(convexFileBWPackSmall, "Small"),
  // productToPackOption(convexFileBWPackMedium, "Medium"),
  // productToPackOption(convexFileBWPackLarge, "Large"),
];

/**
 * Email Integration Packs
 * Email sending credits for app integrations
 * TEMPORARILY DISABLED: Autumn API 500 errors
 */
export const EMAIL_PACKS: PackOption[] = [
  // productToPackOption(emailCreditPackSmall, "Small"),
  // productToPackOption(emailCreditPackMedium, "Medium"),
  // productToPackOption(emailCreditPackLarge, "Large"),
];

/**
 * AI Integration Packs
 * AI/LLM credits for integrations
 * TEMPORARILY DISABLED: AI packs causing Autumn API 500 errors
 */
export const AI_PACKS: PackOption[] = [
  // productToPackOption(aiCreditPackSmall, "Small"),
  // productToPackOption(aiCreditPackMedium, "Medium"),
  // productToPackOption(aiCreditPackLarge, "Large"),
];

/**
 * Helper to get pack configuration by type
 */
export const PACK_CONFIGS = {
  agent_credits: TOKEN_PACKS,
  convex_function_calls: CONVEX_FUNCTION_CALLS_PACKS,
  convex_compute: CONVEX_COMPUTE_PACKS,
  convex_database_bw: CONVEX_DATABASE_BW_PACKS,
  convex_file_bw: CONVEX_FILE_BW_PACKS,
  email_integration: EMAIL_PACKS,
  llm_integration: AI_PACKS,
} as const;

export type PackType = keyof typeof PACK_CONFIGS;

/**
 * Get pack options by feature ID
 * Returns empty array if feature not found
 */
export function getPacksByFeatureId(featureId: string): PackOption[] {
  return PACK_CONFIGS[featureId as PackType] ?? [];
}

/**
 * Get pack options by product ID
 * Maps product IDs to their corresponding feature packs
 */
export function getPacksByProductId(productId: string): PackOption[] {
  // Map product ID prefixes to feature IDs
  if (productId.startsWith("token_pack")) return TOKEN_PACKS;
  if (productId.startsWith("email_pack")) return EMAIL_PACKS;
  if (productId.startsWith("ai_pack")) return AI_PACKS;
  if (productId.startsWith("convex_function_calls"))
    return CONVEX_FUNCTION_CALLS_PACKS;
  if (productId.startsWith("convex_compute")) return CONVEX_COMPUTE_PACKS;
  if (productId.startsWith("convex_database_bw"))
    return CONVEX_DATABASE_BW_PACKS;
  if (productId.startsWith("convex_file_bw")) return CONVEX_FILE_BW_PACKS;
  return [];
}

// ============================================================================
// Feature Configuration
// ============================================================================

export interface FeatureConfig {
  name: string;
  icon: LucideIcon;
  unit: string; // Display unit (e.g., "credits", "emails", "GB")
  unitPlural?: string; // Optional plural form
  packOptions: PackOption[];
  overagePrice?: number; // Price per unit for overage
  overageBillingUnit?: number; // Billing unit size for overage (e.g., 1M for function calls)
  formatValue?: (value: number) => string; // Optional custom formatter
}

/**
 * Feature metadata configuration
 * Includes display info, icons, units, and pack options
 */
export const FEATURE_CONFIG: Record<string, FeatureConfig> = {
  agent_credits: {
    name: "Agent Credits",
    icon: Coins,
    unit: "credit",
    unitPlural: "credits",
    packOptions: TOKEN_PACKS,
    formatValue: (value) => formatLargeNumber(value),
  },

  email_integration: {
    name: "Email",
    icon: Mail,
    unit: "email",
    unitPlural: "emails",
    packOptions: EMAIL_PACKS,
    overagePrice: 0.1, // $0.10 per email
    overageBillingUnit: 1,
    formatValue: (value) => formatLargeNumber(value),
  },

  llm_integration: {
    name: "AI",
    icon: Brain,
    unit: "token",
    unitPlural: "tokens",
    packOptions: AI_PACKS,
    overagePrice: 0.5, // $0.50 per AI credit
    overageBillingUnit: 1,
    formatValue: (value) => formatLargeNumber(value),
  },

  convex_function_calls: {
    name: "Function Calls",
    icon: Rocket,
    unit: "call",
    unitPlural: "calls",
    packOptions: CONVEX_FUNCTION_CALLS_PACKS,
    overagePrice: 2, // $2 per million calls
    overageBillingUnit: 1000000,
    formatValue: (value) => formatLargeNumber(value),
  },

  convex_compute: {
    name: "Compute",
    icon: Cpu,
    unit: "GB-h",
    unitPlural: "GB-h",
    packOptions: CONVEX_COMPUTE_PACKS,
    overagePrice: 0.3, // $0.30 per GB-hour
    overageBillingUnit: 1,
    formatValue: (value) => formatCompute(value),
  },

  convex_database_bw: {
    name: "Database BW",
    icon: Database,
    unit: "GB",
    unitPlural: "GB",
    packOptions: CONVEX_DATABASE_BW_PACKS,
    overagePrice: 0.2, // $0.20 per GB
    overageBillingUnit: 1,
    formatValue: (value) => {
      // Convert GB to bytes for smart formatting
      const bytes = value * 1024 * 1024 * 1024;
      return formatBytes(bytes);
    },
  },

  convex_file_bw: {
    name: "File BW",
    icon: HardDrive,
    unit: "GB",
    unitPlural: "GB",
    packOptions: CONVEX_FILE_BW_PACKS,
    overagePrice: 0.3, // $0.30 per GB
    overageBillingUnit: 1,
    formatValue: (value) => {
      // Convert GB to bytes for smart formatting
      const bytes = value * 1024 * 1024 * 1024;
      return formatBytes(bytes);
    },
  },
};

/**
 * Get feature configuration by ID
 */
export function getFeatureConfig(featureId: string): FeatureConfig | undefined {
  return FEATURE_CONFIG[featureId];
}

/**
 * Get icon component for a feature ID
 */
export function getFeatureIcon(featureId: string): LucideIcon {
  return FEATURE_CONFIG[featureId]?.icon ?? Coins;
}

/**
 * Get display name for a feature ID
 */
export function getFeatureName(featureId: string): string {
  return FEATURE_CONFIG[featureId]?.name ?? featureId;
}

/**
 * Get pack options for a feature ID
 */
export function getFeaturePackOptions(featureId: string): PackOption[] {
  return FEATURE_CONFIG[featureId]?.packOptions ?? [];
}

/**
 * Format a feature value according to its configuration
 */
export function formatFeatureValue(featureId: string, value: number): string {
  const config = FEATURE_CONFIG[featureId];
  if (config?.formatValue) {
    return config.formatValue(value);
  }
  return value.toLocaleString();
}

/**
 * Get unit string for a feature (singular or plural)
 */
export function getFeatureUnit(featureId: string, count: number = 1): string {
  const config = FEATURE_CONFIG[featureId];
  if (!config) return "";

  if (count === 1) {
    return config.unit;
  }
  return config.unitPlural ?? config.unit;
}

/**
 * Calculate overage cost for a feature
 * Returns cost in dollars
 */
export function calculateOverageCost(
  featureId: string,
  overageAmount: number,
): number {
  const config = FEATURE_CONFIG[featureId];
  if (!config?.overagePrice) return 0;

  const billingUnit = config.overageBillingUnit ?? 1;
  return (overageAmount / billingUnit) * config.overagePrice;
}

/**
 * Calculate total overage cost across multiple features
 */
export function calculateTotalOverageCost(
  overages: Record<string, number>,
): number {
  return Object.entries(overages).reduce((total, [featureId, amount]) => {
    return total + calculateOverageCost(featureId, amount);
  }, 0);
}

/**
 * Check if a feature has overage pricing configured
 */
export function hasOveragePricing(featureId: string): boolean {
  const config = FEATURE_CONFIG[featureId];
  return !!config?.overagePrice;
}
