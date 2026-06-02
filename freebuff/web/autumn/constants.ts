/**
 * Autumn Constants - DATA ONLY
 *
 * This file contains ALL billing/tier/feature DATA:
 * - Types and interfaces
 * - Tier names, prices, and credit amounts
 * - TierDefinition interface and TIER_DEFINITIONS array
 * - Boolean feature IDs and display names
 *
 * For FUNCTIONS (tier lookup, feature access, pricing, formatting),
 * see ./helpers.ts
 *
 * For Autumn SDK products/features, see ./config.ts
 */

// ============================================================================
// SECTION 1: Types
// ============================================================================

export type TierName =
  | "free"
  | "starter"
  | "hobby"
  | "business"
  | "scale"
  | "priority"
  | "ultra"
  | "max"
  | "unlimited"
  | "enterprise";

export interface TierFeatures {
  // Convex Resources
  convexFunctionCalls: number;
  convexCompute: number;
  convexDatabaseBW: number;
  convexFileBW: number;
  // Integrations
  emailCredits: number;
  aiCredits: number;
  // Sandboxes
  sandboxSmall: boolean | "inf";
  sandboxMedium: boolean | "inf";
  sandboxLarge: boolean | "inf";
  // Team Features
  teamSeats: number;
  totalMembers: number | "inf";
  maxProjects: number | "inf";
  // Community
  communityBadgeTier: number;
  // Boolean Features (snake_case to match Autumn feature IDs)
  documentation_visualizer: boolean;
  database_preview: boolean;
  no_vlyai_branding: boolean;
  custom_domains: boolean;
  team_collaboration: boolean;
  integrations_library: boolean;
  project_code_editor: boolean;
  agent_context_length: boolean;
  github_integration: boolean;
  convex_logs: boolean;
  cli_agent_access: boolean;
  in_app_support: boolean;
  private_projects: boolean;
  claude_opus_access: boolean;
  ui_components_library: boolean;
  theme_customization: boolean;
  data_transfer: boolean;
  personal_phone_support: boolean;
  hire_developers: boolean;
  unlimited_projects: boolean;
}

export interface TierDefinition {
  id: TierName;
  name: string;
  planId: string;
  basePrice: number;
  creditsIncluded: number;
  creditsRecurring: boolean;
  color: string;
  gradient: string;
  isHidden: boolean;
  isRecommended: boolean;
  features: TierFeatures;
  highlights: string[];
}

export interface AutumnCustomer {
  id: string | null;
  products?: Array<{
    id: string;
    name?: string | null;
    is_add_on?: boolean;
    status?: string;
    scenario?: string;
    canceled_at?: number | null;
    current_period_end?: number | null;
  }>;
  features?: Record<
    string,
    | {
        has_access?: boolean;
        balance?: number | null;
        usage?: number;
        included_usage?: number | "inf";
      }
    | undefined
  >;
}

export interface PricingCalculation {
  tier: TierDefinition;
  monthlyPrice: number;
  creditsIncluded: number;
  creditsRecurring: boolean;
  pricePerCredit: number;
  discount: number;
  features: TierFeatures;
}

export type PlatformType = "codesandbox" | "convex" | "email" | "llm";

// ============================================================================
// SECTION 2: Core Pricing Constants
// ============================================================================

export const PLAN_PRICES = {
  free: 0,
  starter: 3.99,
  hobby: 12,
  business: 23,
  scale: 55,
  priority: 92,
  ultra: 180,
  max: 350,
  unlimited: 600,
  enterprise: 999,
} as const;

export const PLAN_BASE_CREDITS = {
  free: 4_000_000,
  starter: 4_000_000,
  hobby: 15_000_000,
  business: 30_000_000,
  scale: 70_000_000,
  priority: 120_000_000,
  ultra: 200_000_000,
  max: 500_000_000,
  unlimited: 1_000_000_000,
  enterprise: 2_000_000_000,
} as const;

export const ORIGINAL_PRICES = {
  starter: 7.99,
  hobby: 24,
  business: 46,
  scale: 110,
  priority: 184,
  ultra: 360,
  max: 700,
  unlimited: 1200,
} as const;

export const PLAN_IDS = {
  free: "free_plan",
  starter: "starter_plan",
  hobby: "hobby_plan",
  business: "business_plan",
  scale: "scale_plan",
  priority: "priority_plan",
  ultra: "ultra_plan",
  max: "max_plan",
  unlimited: "unlimited_plan",
  enterprise: "enterprise_plan",
} as const;

export const PRICE_PER_MILLION_CREDITS = 1.0;
export const CREDIT_BILLING_UNIT = 1_000_000;

/**
 * Credit multipliers by tier
 * Lower tiers pay MORE credits for the same usage to incentivize upgrades.
 * Higher tiers (priority, max, enterprise) have no multiplier (1.0).
 *
 * Example: Starter user using 100 credits pays 105 credits (5% more)
 */
export const CREDIT_MULTIPLIERS: Record<TierName, number> = {
  free: 1.0, // Free users get no penalty (limited credits anyway)
  starter: 1.0, // 5% increase
  hobby: 1.0, // 10% increase
  business: 1.05, // 15% increase
  scale: 1.05, // 20% increase
  priority: 1.05, // 25% increase for premium tiers
  ultra: 1.05, // 25% increase for premium tiers
  max: 1.05, // 25% increase for premium tiers
  unlimited: 1.05, // 25% increase for premium tiers
  enterprise: 1.05, // 25% increase for enterprise
} as const;

export const HIDDEN_TIERS: TierName[] = [
  "priority",
  "ultra",
  "max",
  "unlimited",
];

export const TIER_ORDER: TierName[] = [
  "free",
  "starter",
  "hobby",
  "business",
  "scale",
  "priority",
  "ultra",
  "max",
  "unlimited",
  "enterprise",
];

// ============================================================================
// SECTION 3: Tier Resource Limits
// ============================================================================

export const TIER_LIMITS = {
  free: {
    agentCredits: PLAN_BASE_CREDITS.free,
    emailCredits: 20,
    llmCredits: 50,
    convexFunctionCalls: 100_000,
    convexCompute: 1,
    convexDatabaseBW: 1,
    convexFileBW: 1,
    teamSeats: 0,
    totalMembers: 1,
    maxProjects: 2,
    communityBadgeTier: 0,
  },
  starter: {
    agentCredits: PLAN_BASE_CREDITS.starter,
    emailCredits: 100,
    llmCredits: 100,
    convexFunctionCalls: 200_000,
    convexCompute: 2,
    convexDatabaseBW: 2,
    convexFileBW: 2,
    teamSeats: 0,
    totalMembers: 2,
    maxProjects: 4,
    communityBadgeTier: 1,
  },
  hobby: {
    agentCredits: PLAN_BASE_CREDITS.hobby,
    emailCredits: 300,
    llmCredits: 250,
    convexFunctionCalls: 500_000,
    convexCompute: 5,
    convexDatabaseBW: 5,
    convexFileBW: 5,
    teamSeats: 0,
    totalMembers: 3,
    maxProjects: 10,
    communityBadgeTier: 2,
  },
  business: {
    agentCredits: PLAN_BASE_CREDITS.business,
    emailCredits: 1000,
    llmCredits: 500,
    convexFunctionCalls: 1_500_000,
    convexCompute: 10,
    convexDatabaseBW: 10,
    convexFileBW: 10,
    teamSeats: 0,
    totalMembers: 4,
    maxProjects: 15,
    communityBadgeTier: 3,
  },
  scale: {
    agentCredits: PLAN_BASE_CREDITS.scale,
    emailCredits: 2000,
    llmCredits: 1000,
    convexFunctionCalls: 2_500_000,
    convexCompute: 25,
    convexDatabaseBW: 25,
    convexFileBW: 25,
    teamSeats: 5,
    totalMembers: 8,
    maxProjects: 30,
    communityBadgeTier: 4,
  },
  priority: {
    agentCredits: PLAN_BASE_CREDITS.priority,
    emailCredits: 5000,
    llmCredits: 2500,
    convexFunctionCalls: 5_000_000,
    convexCompute: 50,
    convexDatabaseBW: 50,
    convexFileBW: 50,
    teamSeats: 10,
    totalMembers: 15,
    maxProjects: 60,
    communityBadgeTier: 5,
  },
  ultra: {
    agentCredits: PLAN_BASE_CREDITS.ultra,
    emailCredits: 10000,
    llmCredits: 5000,
    convexFunctionCalls: 20_000_000,
    convexCompute: 75,
    convexDatabaseBW: 75,
    convexFileBW: 75,
    teamSeats: 15,
    totalMembers: 25,
    maxProjects: 120,
    communityBadgeTier: 6,
  },
  max: {
    agentCredits: PLAN_BASE_CREDITS.max,
    emailCredits: 30000,
    llmCredits: 10000,
    convexFunctionCalls: 25_000_000,
    convexCompute: 100,
    convexDatabaseBW: 100,
    convexFileBW: 100,
    teamSeats: 50,
    totalMembers: 50,
    maxProjects: 250,
    communityBadgeTier: 7,
  },
  unlimited: {
    agentCredits: PLAN_BASE_CREDITS.unlimited,
    emailCredits: 100000,
    llmCredits: 25000,
    convexFunctionCalls: 50_000_000,
    convexCompute: 200,
    convexDatabaseBW: 200,
    convexFileBW: 200,
    teamSeats: 100,
    totalMembers: 100,
    maxProjects: 1000,
    communityBadgeTier: 8,
  },
  enterprise: {
    agentCredits: PLAN_BASE_CREDITS.enterprise,
    emailCredits: 10000,
    llmCredits: 50000,
    convexFunctionCalls: 100_000_000,
    convexCompute: 500,
    convexDatabaseBW: 500,
    convexFileBW: 500,
    teamSeats: 100,
    totalMembers: 2000,
    maxProjects: 500,
    communityBadgeTier: 9,
  },
} as const;

// Free tier credits configuration (one-time grant)
export const FREE_TIER_CREDITS = {
  amount: PLAN_BASE_CREDITS.free,
  isOneTime: true,
} as const;

// ============================================================================
// SECTION 4: Boolean Feature Configuration
// ============================================================================

// Features unlocked at each tier (cumulative) - SINGLE SOURCE OF TRUTH
export const BOOLEAN_FEATURES = {
  starter: [
    "documentation_visualizer",
    "database_preview",
    "no_vlyai_branding",
    "custom_domains",
  ],
  hobby: [
    "team_collaboration",
    "integrations_library",
    "project_code_editor",
    "agent_context_length",
  ],
  business: [
    "github_integration",
    "convex_logs",
    "cli_agent_access",
    "in_app_support",
    "private_projects",
  ],
  scale: [
    "claude_opus_access",
    "ui_components_library",
    "theme_customization",
    "data_transfer",
  ],
  priority: ["personal_phone_support"],
  ultra: ["hire_developers"],
  max: [],
  unlimited: ["unlimited_projects"],
} as const;

function createTierFeatures(tier: TierName): TierFeatures {
  const limits = TIER_LIMITS[tier];
  const tierIndex = TIER_ORDER.indexOf(tier);

  // Collect all boolean features for this tier and below
  const enabledFeatures = new Set<string>();
  for (const [featureTier, features] of Object.entries(BOOLEAN_FEATURES)) {
    if (
      TIER_ORDER.indexOf(featureTier as TierName) <= tierIndex &&
      TIER_ORDER.indexOf(featureTier as TierName) > 0
    ) {
      features.forEach((f) => enabledFeatures.add(f));
    }
  }

  return {
    convexFunctionCalls: limits.convexFunctionCalls,
    convexCompute: limits.convexCompute,
    convexDatabaseBW: limits.convexDatabaseBW,
    convexFileBW: limits.convexFileBW,
    emailCredits: limits.emailCredits,
    aiCredits: limits.llmCredits,
    sandboxSmall: "inf",
    sandboxMedium: tierIndex >= 2 ? "inf" : false, // hobby+
    sandboxLarge: tierIndex >= 3 ? "inf" : false, // business+
    teamSeats: limits.teamSeats,
    totalMembers: tierIndex >= 7 ? "inf" : limits.totalMembers, // max+
    maxProjects: limits.maxProjects,
    communityBadgeTier: limits.communityBadgeTier,
    // Boolean features
    documentation_visualizer: enabledFeatures.has("documentation_visualizer"),
    database_preview: enabledFeatures.has("database_preview"),
    no_vlyai_branding: enabledFeatures.has("no_vlyai_branding"),
    custom_domains: enabledFeatures.has("custom_domains"),
    team_collaboration: enabledFeatures.has("team_collaboration"),
    integrations_library: enabledFeatures.has("integrations_library"),
    project_code_editor: enabledFeatures.has("project_code_editor"),
    agent_context_length: enabledFeatures.has("agent_context_length"),
    github_integration: enabledFeatures.has("github_integration"),
    convex_logs: enabledFeatures.has("convex_logs"),
    cli_agent_access: enabledFeatures.has("cli_agent_access"),
    in_app_support: enabledFeatures.has("in_app_support"),
    private_projects: enabledFeatures.has("private_projects"),
    claude_opus_access: enabledFeatures.has("claude_opus_access"),
    ui_components_library: enabledFeatures.has("ui_components_library"),
    theme_customization: enabledFeatures.has("theme_customization"),
    data_transfer: enabledFeatures.has("data_transfer"),
    personal_phone_support: enabledFeatures.has("personal_phone_support"),
    hire_developers: enabledFeatures.has("hire_developers"),
    unlimited_projects: enabledFeatures.has("unlimited_projects"),
  };
}

// Tier highlights for UI display
export const TIER_HIGHLIGHTS: Record<TierName, string[]> = {
  free: [
    "2M agent credits (one-time)",
    "Basic project access",
    "Small cloud workspaces",
    "Community support",
  ],
  starter: [
    "4M agent credits",
    "Documentation visualizer",
    "Custom domains",
    "Remove branding",
    "Community Badge Tier 1",
  ],
  hobby: [
    "15M agent credits",
    "Team members (max 2)",
    "Integrations library",
    "Code editor access",
    "Medium sandboxes",
  ],
  business: [
    "30M agent credits",
    "Git Sync",
    "Claude Code / Gemini CLI / Codex",
    "Backend logs",
    "In-app support",
    "Large sandboxes",
  ],
  scale: [
    "70M agent credits",
    "Claude Opus access",
    "UI Components library",
    "Theme customization",
    "Data transfer (dev ↔ prod)",
    "5 team seats",
  ],
  priority: [
    "120M agent credits",
    "Personal phone support",
    "10 team seats",
    "Priority response times",
  ],
  ultra: [
    "200M agent credits",
    "Hire developers on-demand",
    "15 team seats",
    "Enhanced support",
  ],
  max: [
    "500M agent credits",
    "Unlimited projects",
    "25 team seats",
    "Highest priority support",
  ],
  unlimited: [
    "1000M agent credits",
    "Unlimited projects",
    "50 team seats",
    "Dedicated support",
    "Everything included",
  ],
  enterprise: [
    "Custom credit allocation",
    "Dedicated support",
    "Custom integrations",
    "SLA guarantees",
    "100+ team seats",
  ],
};

const TIER_COLORS: Record<TierName, { color: string; gradient: string }> = {
  free: { color: "zinc", gradient: "from-zinc-50 to-zinc-100" },
  starter: { color: "emerald", gradient: "from-emerald-50 to-emerald-100" },
  hobby: { color: "blue", gradient: "from-blue-50 to-blue-100" },
  business: { color: "purple", gradient: "from-purple-50 to-purple-100" },
  scale: { color: "indigo", gradient: "from-indigo-50 to-indigo-100" },
  priority: { color: "amber", gradient: "from-amber-50 to-amber-100" },
  ultra: { color: "orange", gradient: "from-orange-50 to-orange-100" },
  max: { color: "rose", gradient: "from-rose-50 to-rose-100" },
  unlimited: { color: "fuchsia", gradient: "from-fuchsia-50 to-fuchsia-100" },
  enterprise: { color: "violet", gradient: "from-violet-50 to-violet-100" },
};

// ============================================================================
// SECTION 5: TIER_DEFINITIONS (Generated from above data)
// ============================================================================

export const TIER_DEFINITIONS: TierDefinition[] = TIER_ORDER.map((tier) => ({
  id: tier,
  name: tier.charAt(0).toUpperCase() + tier.slice(1),
  planId: PLAN_IDS[tier],
  basePrice: PLAN_PRICES[tier],
  creditsIncluded: PLAN_BASE_CREDITS[tier],
  creditsRecurring: tier !== "free",
  color: TIER_COLORS[tier].color,
  gradient: TIER_COLORS[tier].gradient,
  isHidden: HIDDEN_TIERS.includes(tier),
  isRecommended: tier === "business",
  features: createTierFeatures(tier),
  highlights: TIER_HIGHLIGHTS[tier],
}));

// ============================================================================
// SECTION 6: Boolean Feature IDs & Display Names
// ============================================================================

// All boolean feature IDs derived from BOOLEAN_FEATURES
export const ALL_BOOLEAN_FEATURE_IDS = [
  ...BOOLEAN_FEATURES.starter,
  ...BOOLEAN_FEATURES.hobby,
  ...BOOLEAN_FEATURES.business,
  ...BOOLEAN_FEATURES.scale,
  ...BOOLEAN_FEATURES.priority,
  ...BOOLEAN_FEATURES.ultra,
  ...BOOLEAN_FEATURES.max,
  ...BOOLEAN_FEATURES.unlimited,
] as const;

export type BooleanFeatureId = (typeof ALL_BOOLEAN_FEATURE_IDS)[number];

export const FEATURE_DISPLAY_NAMES: Record<string, string> = {
  documentation_visualizer: "Documentation Visualizer",
  database_preview: "Database Access",
  no_vlyai_branding: "Remove vly.ai Branding",
  custom_domains: "Custom Domains",
  team_collaboration: "Team Collaboration",
  integrations_library: "Integrations Library",
  project_code_editor: "Project Code Editor",
  agent_context_length: "Extended Agent Context",
  github_integration: "GitHub Integration",
  convex_logs: "Backend Logs",
  cli_agent_access: "Run Claude Code, Gemini CLI and Codex",
  in_app_support: "In-app Support",
  private_projects: "Private Projects",
  claude_opus_access: "Claude Opus Access",
  ui_components_library: "UI Components & Templates",
  theme_customization: "Theme Customization",
  data_transfer: "Data Transfer (Dev ↔ Prod)",
  personal_phone_support: "Personal Phone Support",
  hire_developers: "Hire Developers On-Demand",
  unlimited_projects: "Unlimited Projects",
};

// ============================================================================
// SECTION 7: Auto-Derived Feature Minimum Tier Map
// ============================================================================

function buildFeatureMinimumTierMap(): Record<string, TierName> {
  const result: Record<string, TierName> = {};
  for (const [tier, features] of Object.entries(BOOLEAN_FEATURES)) {
    for (const featureId of features) {
      if (!result[featureId]) {
        result[featureId] = tier as TierName;
      }
    }
  }
  return result;
}

export const FEATURE_MINIMUM_TIER: Record<string, TierName> =
  buildFeatureMinimumTierMap();

// ============================================================================
// SECTION 8: Platform Credit Costs
// ============================================================================

export const PLATFORM_CREDIT_COSTS = {
  codesandbox: { small: 50, medium: 100, large: 200 },
  convex: {
    base: 25,
    perFunctionCall: 0.00001,
    perGBCompute: 0.05,
    perGBDatabaseBW: 0.02,
    perGBFileBW: 0.03,
  },
  email: { perEmail: 10 },
  llm: { perToken: 0.001 },
} as const;
