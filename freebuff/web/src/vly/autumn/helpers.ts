/**
 * Autumn Helpers - ALL FUNCTIONS
 *
 * This file contains all billing/tier/feature FUNCTIONS:
 * - Tier lookup functions
 * - Feature access functions
 * - Pricing functions
 * - Formatting functions
 * - Platform cost functions
 * - Autumn SDK product builders
 *
 * For DATA (types, constants, tier definitions), see ./constants.ts
 */

import { featureItem, pricedFeatureItem, priceItem, product } from "atmn";
import {
  type TierName,
  type TierDefinition,
  type AutumnCustomer,
  type PricingCalculation,
  type BooleanFeatureId,
  type PlatformType,
  TIER_DEFINITIONS,
  TIER_ORDER,
  PLAN_PRICES,
  PLAN_BASE_CREDITS,
  PLAN_IDS,
  ORIGINAL_PRICES,
  FEATURE_MINIMUM_TIER,
  FEATURE_DISPLAY_NAMES,
  PLATFORM_CREDIT_COSTS,
  FREE_TIER_CREDITS,
} from "./constants";

// Re-export FREE_TIER_CREDITS for convenience
export { FREE_TIER_CREDITS };

// ============================================================================
// SECTION 1: Tier Lookup Functions
// ============================================================================

export function getTierById(id: TierName): TierDefinition | undefined {
  return TIER_DEFINITIONS.find((t) => t.id === id);
}

export function getNextTier(currentTier: TierName): TierDefinition | null {
  const currentIndex = TIER_DEFINITIONS.findIndex((t) => t.id === currentTier);
  if (currentIndex === -1 || currentIndex === TIER_DEFINITIONS.length - 1) {
    return null;
  }
  return TIER_DEFINITIONS[currentIndex + 1];
}

export function getPublicTiers(): TierDefinition[] {
  return TIER_DEFINITIONS.filter((t) => !t.isHidden);
}

export function getUpgradeTiersFor(currentTier: TierName): TierDefinition[] {
  const currentIndex = TIER_DEFINITIONS.findIndex((t) => t.id === currentTier);
  if (currentIndex === -1) return getPublicTiers();

  // For hidden tier users, show the next hidden tier as an upgrade option
  if (currentTier === "scale") {
    return TIER_DEFINITIONS.filter(
      (t, idx) => idx > currentIndex && (t.id === "priority" || !t.isHidden),
    );
  }
  if (currentTier === "priority") {
    return TIER_DEFINITIONS.filter(
      (t, idx) => idx > currentIndex && (t.id === "ultra" || !t.isHidden),
    );
  }
  if (currentTier === "ultra") {
    return TIER_DEFINITIONS.filter(
      (t, idx) => idx > currentIndex && (t.id === "max" || !t.isHidden),
    );
  }
  if (currentTier === "max") {
    return TIER_DEFINITIONS.filter(
      (t, idx) => idx > currentIndex && (t.id === "unlimited" || !t.isHidden),
    );
  }
  return TIER_DEFINITIONS.filter((t, idx) => idx > currentIndex && !t.isHidden);
}

export function getPlanIdForTier(tier: TierName): string {
  return PLAN_IDS[tier] ?? PLAN_IDS.free;
}

export function isTierRecurring(tier: TierName): boolean {
  return tier !== "free";
}

export function compareTiers(a: TierName, b: TierName): number {
  const aIndex = TIER_ORDER.indexOf(a);
  const bIndex = TIER_ORDER.indexOf(b);
  if (aIndex < bIndex) return -1;
  if (aIndex > bIndex) return 1;
  return 0;
}

export function isTierAtOrAbove(
  customerTier: TierName,
  requiredTier: TierName,
): boolean {
  return compareTiers(customerTier, requiredTier) >= 0;
}

export function getAvailableTiers(): TierDefinition[] {
  return getPublicTiers();
}

// ============================================================================
// SECTION 2: Feature Access Functions
// ============================================================================

const PLAN_NAMES: Record<string, string> = {
  [PLAN_IDS.free]: "Free",
  [PLAN_IDS.starter]: "Starter",
  [PLAN_IDS.hobby]: "Hobby",
  [PLAN_IDS.business]: "Business",
  [PLAN_IDS.scale]: "Scale",
  [PLAN_IDS.priority]: "Priority",
  [PLAN_IDS.ultra]: "Ultra",
  [PLAN_IDS.max]: "Max",
  [PLAN_IDS.unlimited]: "Unlimited",
  [PLAN_IDS.enterprise]: "Enterprise",
};

const PLAN_ID_TO_TIER: Record<string, TierName> = {
  [PLAN_IDS.free]: "free",
  [PLAN_IDS.starter]: "starter",
  [PLAN_IDS.hobby]: "hobby",
  [PLAN_IDS.business]: "business",
  [PLAN_IDS.scale]: "scale",
  [PLAN_IDS.priority]: "priority",
  [PLAN_IDS.ultra]: "ultra",
  [PLAN_IDS.max]: "max",
  [PLAN_IDS.unlimited]: "unlimited",
  [PLAN_IDS.enterprise]: "enterprise",
  // Legacy plan mappings
  hobby_custom_plan: "hobby",
  pro_plan: "business",
  pro_custom_plan: "business",
  team_plan: "scale",
  team_custom_plan: "scale",
  enterprise_custom_plan: "enterprise",
};

function isPlanActive(
  product: {
    status?: string;
    scenario?: string;
    canceled_at?: number | null;
    current_period_end?: number | null;
  },
  now: number,
): boolean {
  if (product.status === "active" || product.scenario === "active") {
    return true;
  }

  // Keep currently running subscriptions considered active during their paid period.
  return !!(
    product.canceled_at &&
    product.current_period_end &&
    now < product.current_period_end
  );
}

function inferTierFromPlanName(name?: string | null): TierName | null {
  if (!name) return null;
  const normalized = name.toLowerCase();
  if (normalized.includes("enterprise")) return "enterprise";
  if (normalized.includes("unlimited")) return "unlimited";
  if (normalized.includes("max")) return "max";
  if (normalized.includes("ultra")) return "ultra";
  if (normalized.includes("priority")) return "priority";
  if (normalized.includes("scale") || normalized.includes("team"))
    return "scale";
  if (normalized.includes("business") || normalized.includes("pro"))
    return "business";
  if (normalized.includes("hobby")) return "hobby";
  if (normalized.includes("starter")) return "starter";
  if (normalized.includes("free")) return "free";
  return null;
}

function getPlanRank(planId: string, planName?: string | null): number {
  const tier = PLAN_ID_TO_TIER[planId] ?? inferTierFromPlanName(planName);
  if (!tier) return -1;
  return TIER_ORDER.indexOf(tier);
}

export function getPlanName(planId: string): string {
  return PLAN_NAMES[planId] ?? "Unknown";
}

export function getActivePlan(
  products: AutumnCustomer["products"],
  customer: AutumnCustomer | null | undefined,
  defaultPlanId: string,
): { planId: string; displayName: string } {
  const now = Date.now();
  const planProducts = (products ?? []).filter((product) => !product.is_add_on);

  // Choose the highest-tier active plan when multiple products are active
  // (for example an old free product alongside a paid subscription).
  const activePlan = planProducts
    .filter((product) => isPlanActive(product, now))
    .sort((a, b) => getPlanRank(b.id, b.name) - getPlanRank(a.id, a.name))[0];

  if (activePlan) {
    return {
      planId: activePlan.id,
      displayName: activePlan.name || getPlanName(activePlan.id),
    };
  }

  const scheduledDowngradePlan = planProducts.find((product) => {
    return (
      product.scenario === "scheduled" ||
      (product.canceled_at &&
        product.current_period_end &&
        now < product.current_period_end)
    );
  });

  if (scheduledDowngradePlan) {
    return {
      planId: scheduledDowngradePlan.id,
      displayName:
        scheduledDowngradePlan.name || getPlanName(scheduledDowngradePlan.id),
    };
  }

  return { planId: defaultPlanId, displayName: getPlanName(defaultPlanId) };
}

function getPlanFeatures(planId: string): string[] {
  const tier = TIER_DEFINITIONS.find((t) => t.planId === planId);
  if (!tier) return [];
  return Object.entries(tier.features)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}

export function hasFeatureAccess(
  customer: AutumnCustomer | null | undefined,
  featureId: BooleanFeatureId | string,
): boolean {
  if (!customer) return false;

  if (customer.features) {
    const feature = customer.features[featureId];
    if (feature) {
      if ("has_access" in feature) return feature.has_access === true;
      return true;
    }
  }

  if (customer.products) {
    const activePlan = getActivePlan(
      customer.products,
      customer,
      PLAN_IDS.free,
    );
    const planFeatures = getPlanFeatures(activePlan.planId);
    if (planFeatures.includes(featureId)) return true;
  }

  return false;
}

export function hasAllFeaturesAccess(
  customer: AutumnCustomer | null | undefined,
  featureIds: (BooleanFeatureId | string)[],
): boolean {
  return featureIds.every((featureId) => hasFeatureAccess(customer, featureId));
}

export function hasAnyFeatureAccess(
  customer: AutumnCustomer | null | undefined,
  featureIds: (BooleanFeatureId | string)[],
): boolean {
  return featureIds.some((featureId) => hasFeatureAccess(customer, featureId));
}

export function getMissingFeatures(
  customer: AutumnCustomer | null | undefined,
  featureIds: (BooleanFeatureId | string)[],
): string[] {
  return featureIds.filter(
    (featureId) => !hasFeatureAccess(customer, featureId),
  );
}

export function getMinimumTierForFeature(featureId: string): TierName | null {
  return FEATURE_MINIMUM_TIER[featureId] ?? null;
}

export function getFeatureAccessErrorMessage(
  featureId: string,
  includeUpgradePrompt = true,
): string {
  const featureName = FEATURE_DISPLAY_NAMES[featureId] ?? featureId;
  const requiredTier = FEATURE_MINIMUM_TIER[featureId];
  const tierDef = requiredTier ? getTierById(requiredTier) : null;
  const baseMessage = `${featureName} is not available on your current plan.`;
  if (includeUpgradePrompt && tierDef) {
    return `${baseMessage} Upgrade to ${tierDef.name} or higher to access this feature.`;
  }
  return baseMessage;
}

// ============================================================================
// SECTION 3: Pricing Functions
// ============================================================================

export function getPriceForTier(tier: TierName): number {
  return PLAN_PRICES[tier] ?? 0;
}

export function calculatePricePerCreditForTier(tier: TierName): number {
  const credits = PLAN_BASE_CREDITS[tier];
  const price = PLAN_PRICES[tier];
  if (credits <= 0) return 0;
  return price / credits;
}

export function calculateDiscountForTier(tier: TierName): number {
  const credits = PLAN_BASE_CREDITS[tier];
  const tierPrice = PLAN_PRICES[tier];
  if (credits <= 0) return 0;
  const packPrice = credits / 1_000_000;
  if (packPrice === 0) return 0;
  const discount = ((packPrice - tierPrice) / packPrice) * 100;
  return Math.max(0, Math.round(discount));
}

export function getPricingForTier(tierName: TierName): PricingCalculation {
  const tier = getTierById(tierName) ?? getTierById("free")!;
  const monthlyPrice = tier.basePrice;
  const pricePerCredit =
    tier.creditsIncluded > 0 ? monthlyPrice / tier.creditsIncluded : 0;
  const packPrice = tier.creditsIncluded / 1_000_000;
  const discount =
    packPrice > 0
      ? Math.max(0, Math.round(((packPrice - monthlyPrice) / packPrice) * 100))
      : 0;

  return {
    tier,
    monthlyPrice,
    creditsIncluded: tier.creditsIncluded,
    creditsRecurring: tier.creditsRecurring,
    pricePerCredit,
    discount,
    features: tier.features,
  };
}

export function getPricingBreakdownForTier(tierName: TierName): {
  basePrice: number;
  creditsIncluded: number;
  creditsRecurring: boolean;
  tier: TierDefinition;
} {
  const tier = getTierById(tierName) ?? getTierById("free")!;
  return {
    basePrice: tier.basePrice,
    creditsIncluded: tier.creditsIncluded,
    creditsRecurring: tier.creditsRecurring,
    tier,
  };
}

export function compareTierPricing(
  currentTier: TierName,
  targetTier: TierName,
): {
  currentPrice: number;
  targetPrice: number;
  priceDiff: number;
  currentCredits: number;
  targetCredits: number;
  creditsDiff: number;
} {
  const current = getTierById(currentTier) ?? getTierById("free")!;
  const target = getTierById(targetTier) ?? getTierById("free")!;
  return {
    currentPrice: current.basePrice,
    targetPrice: target.basePrice,
    priceDiff: target.basePrice - current.basePrice,
    currentCredits: current.creditsIncluded,
    targetCredits: target.creditsIncluded,
    creditsDiff: target.creditsIncluded - current.creditsIncluded,
  };
}

export function getUpgradeOptions(currentTier: TierName): {
  tier: TierName;
  price: number;
  credits: number;
  savings: number;
}[] {
  const currentIndex = TIER_ORDER.indexOf(currentTier);
  if (currentIndex === -1) return [];

  const options: {
    tier: TierName;
    price: number;
    credits: number;
    savings: number;
  }[] = [];
  for (let i = currentIndex + 1; i < TIER_ORDER.length; i++) {
    const tier = TIER_ORDER[i];
    const price = PLAN_PRICES[tier];
    const credits = PLAN_BASE_CREDITS[tier];
    const packPrice = credits / 1_000_000;
    const savings = Math.round(((packPrice - price) / packPrice) * 100);
    options.push({ tier, price, credits, savings: Math.max(0, savings) });
  }
  return options;
}

export function calculateAnnualPriceForTier(
  tier: TierName,
  discountPercent: number = 20,
): number {
  const monthlyPrice = getPriceForTier(tier);
  const annualMonthlyPrice = monthlyPrice * (1 - discountPercent / 100);
  return annualMonthlyPrice * 12;
}

// ============================================================================
// SECTION 4: Formatting Functions
// ============================================================================

export function formatLargeNumber(num: number): string {
  if (num >= 1_000_000_000)
    return `${(num / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (num >= 1_000_000)
    return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return num.toString();
}

export function formatCredits(credits: number): string {
  return formatLargeNumber(credits);
}

export function formatPrice(price: number): string {
  if (price === 0) return "Free";
  const rounded = Math.round(price * 100) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rounded);
}

export function formatCost(credits: number): string {
  return `${formatCredits(credits)} credits`;
}

// Formatted price helpers (replace static FORMATTED_PRICES objects)
export function getFormattedPrice(tier: TierName): string {
  if (tier === "free") return "Free";
  if (tier === "enterprise") return "Custom";
  return `$${PLAN_PRICES[tier]}`;
}

export function getFormattedPriceWithPeriod(tier: TierName): string {
  if (tier === "free") return "Free (one-time)";
  if (tier === "enterprise") return "Custom pricing";
  return `$${PLAN_PRICES[tier]}/month`;
}

export function getFormattedOriginalPrice(
  tier: "starter" | "hobby" | "business" | "scale" | "priority",
): string {
  return `$${ORIGINAL_PRICES[tier]}`;
}

// ============================================================================
// SECTION 5: Platform & Utility Functions
// ============================================================================

export function calculatePlatformCost(
  platform: PlatformType | string,
  usage: number | Record<string, number>,
): number {
  if (!(platform in PLATFORM_CREDIT_COSTS)) return 0;
  const costs =
    PLATFORM_CREDIT_COSTS[platform as keyof typeof PLATFORM_CREDIT_COSTS];

  if (platform === "codesandbox" && typeof usage === "string") {
    return costs[usage as keyof typeof costs] as number;
  }
  if (platform === "email" && typeof usage === "number") {
    return usage * (costs as typeof PLATFORM_CREDIT_COSTS.email).perEmail;
  }
  if (platform === "llm" && typeof usage === "number") {
    return usage * (costs as typeof PLATFORM_CREDIT_COSTS.llm).perToken;
  }
  return 0;
}

export function validateCredits(credits: number): {
  valid: boolean;
  error?: string;
  adjustedCredits?: number;
} {
  const MIN_CREDITS = 0;
  const MAX_CREDITS = PLAN_BASE_CREDITS.enterprise;

  if (credits < MIN_CREDITS) {
    return {
      valid: false,
      error: "Credits cannot be negative",
      adjustedCredits: MIN_CREDITS,
    };
  }
  if (credits > MAX_CREDITS) {
    return {
      valid: false,
      error: `Maximum ${formatCredits(MAX_CREDITS)} credits. Contact sales for higher limits.`,
      adjustedCredits: MAX_CREDITS,
    };
  }
  return { valid: true };
}

export function getHighlightedPlanId(tier: TierName): string | null {
  const tierDef = getTierById(tier);
  return tierDef?.planId ?? null;
}

// ============================================================================
// SECTION 6: Autumn SDK Product Builders
// ============================================================================

// When upgrading plans, reset usage to the new plan's limits (fresh billing cycle)
// The checkout flow separately grants any remaining credits as a one-time bonus
const DEFAULTS = { interval: "month" as const, resetUsage: true };

export const price = (amount: number, interval: "month" | "year" = "month") => [
  priceItem({ price: amount, interval }),
];

export const buildAgentCredits = (
  featureId: string,
  amount: number,
  options?: {
    interval?: "month";
    prepaid?: boolean;
    pricePerUnit?: number;
    overage?: boolean;
    overagePrice?: number;
  },
) => {
  if (options?.prepaid) {
    return [
      pricedFeatureItem({
        feature_id: featureId,
        price: options.pricePerUnit!,
        interval: options.interval ?? DEFAULTS.interval,
        included_usage: amount,
        billing_units: 1000000,
        usage_model: "prepaid",
        reset_usage_when_enabled: DEFAULTS.resetUsage,
      }),
    ];
  }
  if (options?.overage) {
    return [
      pricedFeatureItem({
        feature_id: featureId,
        price: options.overagePrice!,
        interval: options.interval ?? DEFAULTS.interval,
        included_usage: amount,
        billing_units: 1000000,
        usage_model: "pay_per_use",
        reset_usage_when_enabled: DEFAULTS.resetUsage,
      }),
    ];
  }
  return [
    featureItem({
      feature_id: featureId,
      included_usage: amount,
      interval: options?.interval ?? DEFAULTS.interval,
      reset_usage_when_enabled: DEFAULTS.resetUsage,
    }),
  ];
};

export const buildEmailCredits = (
  featureId: string,
  config: { included: number; priced?: boolean; price?: number },
) => [
  config.priced
    ? pricedFeatureItem({
        feature_id: featureId,
        price: config.price ?? 0.1,
        interval: DEFAULTS.interval,
        included_usage: config.included,
        billing_units: 1,
        usage_model: "pay_per_use",
        reset_usage_when_enabled: DEFAULTS.resetUsage,
      })
    : featureItem({
        feature_id: featureId,
        included_usage: config.included,
        interval: DEFAULTS.interval,
        reset_usage_when_enabled: DEFAULTS.resetUsage,
      }),
];

export const buildLlmCredits = (
  featureId: string,
  config: { included: number; priced?: boolean; price?: number },
) => [
  config.priced
    ? pricedFeatureItem({
        feature_id: featureId,
        price: config.price ?? 1.0,
        interval: DEFAULTS.interval,
        included_usage: config.included,
        billing_units: 1,
        usage_model: "pay_per_use",
        reset_usage_when_enabled: DEFAULTS.resetUsage,
      })
    : featureItem({
        feature_id: featureId,
        included_usage: config.included,
        interval: DEFAULTS.interval,
        reset_usage_when_enabled: DEFAULTS.resetUsage,
      }),
];

export const projectBooleans = (
  projectFeatureId: string,
  booleanFeatureIds: string[],
) =>
  booleanFeatureIds.map((featureId) =>
    featureItem({
      feature_id: featureId,
      included_usage: undefined,
      entity_feature_id: projectFeatureId,
      reset_usage_when_enabled: DEFAULTS.resetUsage,
    }),
  );

export const sandboxes = (
  sandboxFeatureIds: Record<"small" | "medium" | "large", string>,
  tiers: Array<"small" | "medium" | "large">,
) =>
  tiers.map((tier) =>
    featureItem({
      feature_id: sandboxFeatureIds[tier],
      included_usage: "inf",
      interval: DEFAULTS.interval,
      reset_usage_when_enabled: DEFAULTS.resetUsage,
    }),
  );

export const convexResources = (
  featureIds: {
    functionCalls: string;
    compute: string;
    databaseBW: string;
    fileBW: string;
  },
  config: { calls: number; compute: number; dbBW: number; fileBW: number },
) => [
  featureItem({
    feature_id: featureIds.functionCalls,
    included_usage: config.calls,
    interval: DEFAULTS.interval,
    reset_usage_when_enabled: DEFAULTS.resetUsage,
  }),
  featureItem({
    feature_id: featureIds.compute,
    included_usage: config.compute,
    interval: DEFAULTS.interval,
    reset_usage_when_enabled: DEFAULTS.resetUsage,
  }),
  featureItem({
    feature_id: featureIds.databaseBW,
    included_usage: config.dbBW,
    interval: DEFAULTS.interval,
    reset_usage_when_enabled: DEFAULTS.resetUsage,
  }),
  featureItem({
    feature_id: featureIds.fileBW,
    included_usage: config.fileBW,
    interval: DEFAULTS.interval,
    reset_usage_when_enabled: DEFAULTS.resetUsage,
  }),
];

export const teamFeatures = (
  featureIds: { seats: string; totalMembers: string; project: string },
  config?: { seats?: number; totalMembers?: number | "inf" },
) => {
  const features = [];
  if (config?.seats !== undefined) {
    features.push(
      featureItem({
        feature_id: featureIds.seats,
        included_usage: config.seats,
        interval: DEFAULTS.interval,
        reset_usage_when_enabled: DEFAULTS.resetUsage,
      }),
    );
  }
  if (config?.totalMembers !== undefined) {
    features.push(
      featureItem({
        feature_id: featureIds.totalMembers,
        included_usage: config.totalMembers,
        interval: DEFAULTS.interval,
        reset_usage_when_enabled: DEFAULTS.resetUsage,
      }),
    );
  }
  return features;
};

export const createPackTrio = (config: {
  baseId: string;
  baseName: string;
  featureId: string;
  packs: {
    small: { price: number; usage: number; nameOverride?: string };
    medium: { price: number; usage: number; nameOverride?: string };
    large: { price: number; usage: number; nameOverride?: string };
  };
}) => {
  const sizes = ["small", "medium", "large"] as const;
  return sizes.reduce(
    (acc, size) => {
      const packConfig = config.packs[size];
      acc[size] = product({
        id: `${config.baseId}_${size}`,
        name:
          packConfig.nameOverride ??
          `${packConfig.usage.toLocaleString()} ${config.baseName}`,
        is_add_on: true,
        items: [
          priceItem({ price: packConfig.price }),
          featureItem({
            feature_id: config.featureId,
            included_usage: packConfig.usage,
          }),
        ],
      });
      return acc;
    },
    {} as Record<"small" | "medium" | "large", ReturnType<typeof product>>,
  );
};
