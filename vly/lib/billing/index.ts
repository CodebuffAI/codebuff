/**
 * Billing module - Centralized exports
 * Clean import path: import { ... } from '@/lib/billing'
 *
 * SOURCE OF TRUTH:
 * - Data: @/autumn/constants
 * - Functions: @/autumn/helpers
 */

// ============================================================================
// Types and Constants from autumn/constants.ts
// ============================================================================

export {
  // Types
  type TierName,
  type TierFeatures,
  type TierDefinition,
  type BooleanFeatureId,
  type AutumnCustomer,
  type PricingCalculation,
  type PlatformType,

  // Pricing constants
  PLAN_PRICES,
  PLAN_BASE_CREDITS,
  PRICE_PER_MILLION_CREDITS,
  CREDIT_BILLING_UNIT,
  ORIGINAL_PRICES,
  TIER_ORDER,
  PLAN_IDS,
  HIDDEN_TIERS,
  TIER_LIMITS,

  // Tier definitions
  TIER_DEFINITIONS,

  // Free tier credits (one-time grant)
  FREE_TIER_CREDITS,

  // Feature IDs and mappings
  ALL_BOOLEAN_FEATURE_IDS,
  FEATURE_DISPLAY_NAMES,
  FEATURE_MINIMUM_TIER,

  // Platform costs
  PLATFORM_CREDIT_COSTS,
} from "@/autumn/constants";

// ============================================================================
// Functions from autumn/helpers.ts
// ============================================================================

export {
  // Tier functions
  getTierById,
  getNextTier,
  getPublicTiers,
  getUpgradeTiersFor,
  getPlanIdForTier,
  isTierRecurring,
  compareTiers,
  isTierAtOrAbove,
  getAvailableTiers,

  // Feature access functions
  hasFeatureAccess,
  hasAllFeaturesAccess,
  hasAnyFeatureAccess,
  getMissingFeatures,
  getMinimumTierForFeature,
  getFeatureAccessErrorMessage,
  getPlanName,
  getActivePlan,

  // Pricing functions
  getPriceForTier,
  getPricingForTier,
  getPricingBreakdownForTier,
  calculatePricePerCreditForTier,
  calculateDiscountForTier,
  getUpgradeOptions,
  compareTierPricing,
  calculateAnnualPriceForTier,
  getHighlightedPlanId,
  validateCredits,

  // Formatting utilities
  formatCredits,
  formatLargeNumber,
  formatPrice,
  formatCost,
  getFormattedPrice,
  getFormattedPriceWithPeriod,
  getFormattedOriginalPrice,

  // Platform costs
  calculatePlatformCost,
} from "@/autumn/helpers";

// ============================================================================
// Feature configuration, metadata, and pack configurations
// ============================================================================

export {
  FEATURE_CONFIG,
  getFeatureConfig,
  getFeatureIcon,
  getFeatureName,
  getFeaturePackOptions,
  formatFeatureValue,
  getFeatureUnit,
  calculateOverageCost,
  calculateTotalOverageCost,
  hasOveragePricing,
  TOKEN_PACKS,
  EMAIL_PACKS,
  AI_PACKS,
  CONVEX_FUNCTION_CALLS_PACKS,
  CONVEX_COMPUTE_PACKS,
  CONVEX_DATABASE_BW_PACKS,
  CONVEX_FILE_BW_PACKS,
  PACK_CONFIGS,
  getPacksByFeatureId,
  getPacksByProductId,
  type FeatureConfig,
  type PackOption,
  type PackType,
} from "./feature-config";

// ============================================================================
// Usage and activity utilities
// ============================================================================

export {
  transformCustomerToUsageActivity,
  calculateFeatureOverageCost,
  calculateGroupOverageCost,
  calculateGroupAverageUsage,
  calculateGroupMaxUsage,
  getUsageColorClasses,
  extractCustomerFeatures,
  calculateCreditPercentage,
  type UsageActivity,
  type FeatureWithId,
  type ExtractedFeatures,
} from "./usage-utils";

// ============================================================================
// Product configuration, icons, and utilities
// ============================================================================

export {
  getProductIcon,
  getProductColorClasses,
  getProductButtonHoverClasses,
  isKnownPackProduct,
  filterProductsByInterval,
  separateProductsByType,
  PRODUCT_ICON_CONFIG,
  type ProductIconConfig,
} from "./product-config";

// ============================================================================
// Checkout utilities
// ============================================================================

export {
  handleProductCheckout,
  createCheckoutHandler,
  handleDirectPlanCheckout,
  createDirectPlanCheckoutHandler,
  type DirectPlanCheckoutFn,
} from "./checkout-utils";

// ============================================================================
// Workspace quota utilities
// ============================================================================

export {
  getSandboxFeatureId,
  checkSandboxQuota,
  checkProjectWorkspaceQuota,
  getAvailableDowngradeTiers,
  getAutoDowngradeTier,
  getTierQuotaInfo,
  compareTierSize,
  isUpgrade,
  isDowngrade,
  type SandboxQuotaCheck,
  type ProjectForQuotaCheck,
  type ProjectWorkspaceQuotaCheck,
  type AvailableTier,
} from "./workspace-quota-utils";

// ============================================================================
// Shared types
// ============================================================================

export type {
  CustomerFeature,
  BooleanFeature,
  PaymentMethod,
  CustomerProduct,
  UsageColorScheme,
  PlanConfig,
  OverageResult,
  UsageMetric,
  BillingSectionProps,
  CheckoutHandlerParams,
} from "./types";
