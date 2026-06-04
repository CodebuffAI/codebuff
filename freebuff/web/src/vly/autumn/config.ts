/**
 * Autumn Configuration
 *
 * This file contains ONLY Autumn SDK objects:
 * - Features: All billable feature definitions (with 'type' field)
 * - Products: Subscription plans and add-on packs (with 'items' field)
 *
 * For pricing constants, helper functions, and formatted strings,
 * see ./constants.ts
 *
 * For builder helpers, see ./helpers.ts
 */

import {
  feature,
  featureItem,
  pricedFeatureItem,
  product,
  priceItem,
} from "atmn";
import {
  price,
  buildAgentCredits,
  buildEmailCredits,
  buildLlmCredits,
  sandboxes,
  convexResources,
  teamFeatures,
  createPackTrio,
} from "./helpers";
import {
  PLAN_PRICES,
  TIER_LIMITS,
  FREE_TIER_CREDITS,
  BOOLEAN_FEATURES,
} from "./constants";

// ============================================================================
// Features
// ============================================================================

// --- Credit-Based Features ---

export const agentCredits = feature({
  id: "agent_credits",
  name: "Agent Credits",
  type: "single_use",
});

export const emailIntegration = feature({
  id: "email_integration",
  name: "Email Credits",
  type: "single_use",
});

export const llmIntegration = feature({
  id: "llm_integration",
  name: "AI Credits",
  type: "single_use",
});

// --- Core Project Features ---

export const project = feature({
  id: "project",
  name: "Project",
  type: "continuous_use",
});

export const maxProjects = feature({
  id: "max_projects",
  name: "Max Projects",
  type: "continuous_use",
});

// --- Starter Tier Features ($3.99) ---

export const documentationVisualizer = feature({
  id: "documentation_visualizer",
  name: "Documentation Visualizer",
  type: "boolean",
});

export const databasePreview = feature({
  id: "database_preview",
  name: "Database Access",
  type: "boolean",
});

export const noVlyaiBranding = feature({
  id: "no_vlyai_branding",
  name: "Remove Freebuff Web branding",
  type: "boolean",
});

export const customDomains = feature({
  id: "custom_domains",
  name: "Custom Domains",
  type: "boolean",
});

export const communityBadge = feature({
  id: "community_badge",
  name: "Community Badge",
  type: "continuous_use", // Numeric: tier 1, 2, 3, etc.
});

// --- Hobby Tier Features ($12) ---

export const teamCollaboration = feature({
  id: "team_collaboration",
  name: "Team collaboration",
  type: "boolean",
});

export const integrationsLibrary = feature({
  id: "integrations_library",
  name: "Integrations Library",
  type: "boolean",
});

export const projectCodeEditor = feature({
  id: "project_code_editor",
  name: "Project code editor",
  type: "boolean",
});

export const agentContextLength = feature({
  id: "agent_context_length",
  name: "Extended Agent Context",
  type: "boolean",
});

// --- Business Tier Features ($23) ---

export const githubIntegration = feature({
  id: "github_integration",
  name: "Sync to GitHub",
  type: "boolean",
});

export const convexLogs = feature({
  id: "convex_logs",
  name: "Backend Logs",
  type: "boolean",
});

export const cliAgentAccess = feature({
  id: "cli_agent_access",
  name: "Run Claude Code, Gemini CLI and Codex",
  type: "boolean",
});

export const inAppSupport = feature({
  id: "in_app_support",
  name: "In-app support",
  type: "boolean",
});

export const privateProjects = feature({
  id: "private_projects",
  name: "Private Projects",
  type: "boolean",
});

// --- Scale Tier Features ($55) ---

export const claudeOpusAccess = feature({
  id: "claude_opus_access",
  name: "Claude Opus Access",
  type: "boolean",
});

export const uiComponentsLibrary = feature({
  id: "ui_components_library",
  name: "UI Components & Template Library",
  type: "boolean",
});

export const themeCustomization = feature({
  id: "theme_customization",
  name: "Theme customization",
  type: "boolean",
});

export const dataTransfer = feature({
  id: "data_transfer",
  name: "Data Transfer (Dev to Production)",
  type: "boolean",
});

// --- Priority Tier Features ($92) - Hidden ---

export const personalPhoneSupport = feature({
  id: "personal_phone_support",
  name: "Personal Phone Support",
  type: "boolean",
});

// --- Ultra Tier Features ($180) - Hidden ---

export const hireDevelopers = feature({
  id: "hire_developers",
  name: "Hire Developers",
  type: "boolean",
});

// --- Max Tier Features ($350) - Hidden ---

export const unlimitedProjects = feature({
  id: "unlimited_projects",
  name: "Unlimited Projects",
  type: "boolean",
});

// ============================================================================
// Boolean Feature ID Groups (derived from constants.ts BOOLEAN_FEATURES)
// ============================================================================

// Features available at each tier (cumulative)
const STARTER_FEATURE_IDS = BOOLEAN_FEATURES.starter;
const HOBBY_FEATURE_IDS = [...STARTER_FEATURE_IDS, ...BOOLEAN_FEATURES.hobby];
const BUSINESS_FEATURE_IDS = [
  ...HOBBY_FEATURE_IDS,
  ...BOOLEAN_FEATURES.business,
];
const SCALE_FEATURE_IDS = [...BUSINESS_FEATURE_IDS, ...BOOLEAN_FEATURES.scale];
const PRIORITY_FEATURE_IDS = [
  ...SCALE_FEATURE_IDS,
  ...BOOLEAN_FEATURES.priority,
];
const ULTRA_FEATURE_IDS = [...PRIORITY_FEATURE_IDS, ...BOOLEAN_FEATURES.ultra];
const MAX_FEATURE_IDS = [...ULTRA_FEATURE_IDS, ...BOOLEAN_FEATURES.max];
const UNLIMITED_FEATURE_IDS = [
  ...MAX_FEATURE_IDS,
  ...BOOLEAN_FEATURES.unlimited,
];
const ALL_BOOLEAN_FEATURE_IDS = UNLIMITED_FEATURE_IDS;

// --- Sandbox Tiers ---

export const sandboxSmall = feature({
  id: "sandbox_small",
  name: "Small Sandboxes",
  type: "continuous_use",
});

export const sandboxMedium = feature({
  id: "sandbox_medium",
  name: "Medium Sandboxes",
  type: "continuous_use",
});

export const sandboxLarge = feature({
  id: "sandbox_large",
  name: "Large Sandboxes",
  type: "continuous_use",
});

const SANDBOX_FEATURE_IDS = {
  small: sandboxSmall.id,
  medium: sandboxMedium.id,
  large: sandboxLarge.id,
};

// --- Convex Backend Resources ---

export const convexFunctionCalls = feature({
  id: "convex_function_calls",
  name: "Convex Function Calls",
  type: "single_use",
});

export const convexCompute = feature({
  id: "convex_compute",
  name: "Convex Compute",
  type: "single_use",
});

export const convexDatabaseBW = feature({
  id: "convex_database_bw",
  name: "Convex Database Bandwidth",
  type: "single_use",
});

export const convexFileBW = feature({
  id: "convex_file_bw",
  name: "Convex File Bandwidth",
  type: "single_use",
});

const CONVEX_FEATURE_IDS = {
  functionCalls: convexFunctionCalls.id,
  compute: convexCompute.id,
  databaseBW: convexDatabaseBW.id,
  fileBW: convexFileBW.id,
};

// --- Team Features ---

export const seats = feature({
  id: "seats",
  name: "Team Seats",
  type: "continuous_use",
});

export const totalMembers = feature({
  id: "total_members",
  name: "Total Members",
  type: "continuous_use",
});

const TEAM_FEATURE_IDS = {
  seats: seats.id,
  totalMembers: totalMembers.id,
  project: project.id,
};

// ============================================================================
// Helper to build boolean features for a plan
// ============================================================================

// Boolean features are account-level capabilities (not per-project entity-scoped).
// They should NOT reset on upgrade - they are either on or off.
const buildBooleanFeatures = (featureIds: readonly string[]) =>
  featureIds.map((featureId) =>
    featureItem({
      feature_id: featureId,
      included_usage: undefined,
      reset_usage_when_enabled: false,
    }),
  );

// ============================================================================
// Add-On Packs
// ============================================================================

// --- Agent Credit Packs ($1 per 1M credits) ---
const agentCreditPacks = createPackTrio({
  baseId: "token_pack",
  baseName: "Agent Credits",
  featureId: agentCredits.id,
  packs: {
    small: { price: 10, usage: 10000000, nameOverride: "10M Agent Credits" },
    medium: { price: 50, usage: 50000000, nameOverride: "50M Agent Credits" },
    large: { price: 100, usage: 100000000, nameOverride: "100M Agent Credits" },
  },
});

export const {
  small: tokenPackSmall,
  medium: tokenPackMedium,
  large: tokenPackLarge,
} = agentCreditPacks;

// --- One-Time Credit Pack ($15 for 15M) ---
// Uses priceItem WITHOUT interval to make it truly one-time, not recurring
export const oneTimeCreditPack = product({
  id: "one_time_credit_pack",
  name: "One-Time Credit Pack (15M)",
  is_add_on: true,
  items: [
    priceItem({ price: 15 }), // No interval = one-time purchase
    featureItem({
      feature_id: agentCredits.id,
      included_usage: 15000000, // 15M credits for $15
    }),
  ],
});

// --- Recurring Credit Pack ($12/mo for 15M) ---
// Users can buy multiple of these, each renews independently
export const recurringCreditPack = product({
  id: "recurring_credit_pack",
  name: "Monthly Credit Pack (15M)",
  is_add_on: true,
  items: [
    priceItem({ price: 12, interval: "month" }), // Monthly recurring
    featureItem({
      feature_id: agentCredits.id,
      included_usage: 15000000, // 15M credits for $12/mo
      interval: "month",
    }),
  ],
});

// --- Email Credit Packs ---
const emailCreditPacks = createPackTrio({
  baseId: "email_pack",
  baseName: "Email Credits",
  featureId: emailIntegration.id,
  packs: {
    small: { price: 1, usage: 100 },
    medium: { price: 5, usage: 500 },
    large: { price: 10, usage: 1000 },
  },
});

export const {
  small: emailCreditPackSmall,
  medium: emailCreditPackMedium,
  large: emailCreditPackLarge,
} = emailCreditPacks;

// --- AI Credit Packs ---
const aiCreditPacks = createPackTrio({
  baseId: "ai_pack",
  baseName: "AI Credits",
  featureId: llmIntegration.id,
  packs: {
    small: { price: 0.4, usage: 100 },
    medium: { price: 2, usage: 500 },
    large: { price: 10, usage: 2500 },
  },
});

export const {
  small: aiCreditPackSmall,
  medium: aiCreditPackMedium,
  large: aiCreditPackLarge,
} = aiCreditPacks;

// --- Convex Resource Packs ---
const convexFunctionCallsPacks = createPackTrio({
  baseId: "convex_function_calls_pack",
  baseName: "Function Calls",
  featureId: convexFunctionCalls.id,
  packs: {
    small: { price: 2, usage: 1000000, nameOverride: "1M Function Calls" },
    medium: { price: 8, usage: 5000000, nameOverride: "5M Function Calls" },
    large: { price: 15, usage: 10000000, nameOverride: "10M Function Calls" },
  },
});

export const {
  small: convexFunctionCallsPackSmall,
  medium: convexFunctionCallsPackMedium,
  large: convexFunctionCallsPackLarge,
} = convexFunctionCallsPacks;

const convexComputePacks = createPackTrio({
  baseId: "convex_compute_pack",
  baseName: "Compute",
  featureId: convexCompute.id,
  packs: {
    small: { price: 3, usage: 10, nameOverride: "10 GB-h Compute" },
    medium: { price: 6, usage: 25, nameOverride: "25 GB-h Compute" },
    large: { price: 10, usage: 50, nameOverride: "50 GB-h Compute" },
  },
});

export const {
  small: convexComputePackSmall,
  medium: convexComputePackMedium,
  large: convexComputePackLarge,
} = convexComputePacks;

const convexDatabaseBWPacks = createPackTrio({
  baseId: "convex_database_bw_pack",
  baseName: "Database BW",
  featureId: convexDatabaseBW.id,
  packs: {
    small: { price: 2, usage: 10, nameOverride: "10 GB Database BW" },
    medium: { price: 4, usage: 25, nameOverride: "25 GB Database BW" },
    large: { price: 7, usage: 50, nameOverride: "50 GB Database BW" },
  },
});

export const {
  small: convexDatabaseBWPackSmall,
  medium: convexDatabaseBWPackMedium,
  large: convexDatabaseBWPackLarge,
} = convexDatabaseBWPacks;

const convexFileBWPacks = createPackTrio({
  baseId: "convex_file_bw_pack",
  baseName: "File BW",
  featureId: convexFileBW.id,
  packs: {
    small: { price: 3, usage: 10, nameOverride: "10 GB File BW" },
    medium: { price: 6, usage: 25, nameOverride: "25 GB File BW" },
    large: { price: 10, usage: 50, nameOverride: "50 GB File BW" },
  },
});

export const {
  small: convexFileBWPackSmall,
  medium: convexFileBWPackMedium,
  large: convexFileBWPackLarge,
} = convexFileBWPacks;

// --- Special Products ---

export const referralReward = product({
  id: "referral_reward",
  name: "Referral Reward",
  is_add_on: true,
  items: [
    featureItem({
      feature_id: agentCredits.id,
      included_usage: 10000000, // 10M credits
    }),
  ],
});

// --- Earn Reward Products (Spin Wheel & Bounty Rewards) ---
// Free add-on products attached via the Autumn SDK to grant credits.
// Each product maps to a specific credit amount used by the earn system.

export const earnReward1m = product({
  id: "earn_reward_1m",
  name: "Earn Reward (1M)",
  is_add_on: true,
  items: [
    featureItem({ feature_id: agentCredits.id, included_usage: 1_000_000 }),
  ],
});

export const earnReward2m = product({
  id: "earn_reward_2m",
  name: "Earn Reward (2M)",
  is_add_on: true,
  items: [
    featureItem({ feature_id: agentCredits.id, included_usage: 2_000_000 }),
  ],
});

export const earnReward4m = product({
  id: "earn_reward_4m",
  name: "Earn Reward (4M)",
  is_add_on: true,
  items: [
    featureItem({ feature_id: agentCredits.id, included_usage: 4_000_000 }),
  ],
});

export const earnReward5m = product({
  id: "earn_reward_5m",
  name: "Earn Reward (5M)",
  is_add_on: true,
  items: [
    featureItem({ feature_id: agentCredits.id, included_usage: 5_000_000 }),
  ],
});

export const earnReward10m = product({
  id: "earn_reward_10m",
  name: "Earn Reward (10M)",
  is_add_on: true,
  items: [
    featureItem({ feature_id: agentCredits.id, included_usage: 10_000_000 }),
  ],
});

export const earnReward20m = product({
  id: "earn_reward_20m",
  name: "Earn Reward (20M)",
  is_add_on: true,
  items: [
    featureItem({ feature_id: agentCredits.id, included_usage: 20_000_000 }),
  ],
});

export const earnReward30m = product({
  id: "earn_reward_30m",
  name: "Earn Reward (30M)",
  is_add_on: true,
  items: [
    featureItem({ feature_id: agentCredits.id, included_usage: 30_000_000 }),
  ],
});

export const earnReward50m = product({
  id: "earn_reward_50m",
  name: "Earn Reward (50M)",
  is_add_on: true,
  items: [
    featureItem({ feature_id: agentCredits.id, included_usage: 50_000_000 }),
  ],
});

export const earnReward70m = product({
  id: "earn_reward_70m",
  name: "Earn Reward (70M)",
  is_add_on: true,
  items: [
    featureItem({ feature_id: agentCredits.id, included_usage: 70_000_000 }),
  ],
});

export const earnReward100m = product({
  id: "earn_reward_100m",
  name: "Earn Reward (100M)",
  is_add_on: true,
  items: [
    featureItem({ feature_id: agentCredits.id, included_usage: 100_000_000 }),
  ],
});

export const additionalSeats = product({
  id: "additional_seats",
  name: "Additional Team Seats",
  is_add_on: true,
  items: [
    pricedFeatureItem({
      feature_id: seats.id,
      price: 19, // $19/month per additional seat
      interval: "month",
      included_usage: 1,
      billing_units: 1,
      usage_model: "pay_per_use",
    }),
  ],
});

// ============================================================================
// Subscription Plans - New Tiered System
// ============================================================================
//
// Tier Progression:
// ┌──────────────┬────────┬────────────┬───────────────────────────────────┐
// │ Tier         │ Price  │ Credits    │ Key Unlocks                       │
// ├──────────────┼────────┼────────────┼───────────────────────────────────┤
// │ Free         │ $0     │ -          │ Basic access                      │
// │ Starter      │ $3.99  │ 4M         │ Docs, Database, Branding, Domains │
// │ Hobby        │ $12    │ 15M        │ Team (2), Integrations, Editor    │
// │ Business     │ $23    │ 30M        │ Git, Logs, CLI Agents, Support    │
// │ Scale        │ $55    │ 70M        │ Opus, UI Library, Themes          │
// │ Priority     │ $92    │ 120M       │ Phone Support (Hidden)            │
// │ Ultra        │ $180   │ 200M       │ Hire Devs (Hidden)                │
// │ Max          │ $350   │ 500M       │ 100 projects, Max support (Hidden) │
// │ Unlimited    │ $600   │ 1000M      │ 1000 projects (Hidden)            │
// │ Enterprise   │ Custom │ Custom     │ Everything + Custom               │
// └──────────────┴────────┴────────────┴───────────────────────────────────┘

// --- Free Plan ---
// NOTE: Free plan grants 4M credits ONE-TIME (not recurring)
export const freePlan = product({
  id: "free_plan",
  name: "Free",
  is_default: true,
  items: [
    // 4M agent credits - ONE-TIME grant (no interval = doesn't reset)
    featureItem({
      feature_id: agentCredits.id,
      included_usage: FREE_TIER_CREDITS.amount,
      // No interval specified = one-time grant, does not reset
    }),
    ...convexResources(CONVEX_FEATURE_IDS, {
      calls: TIER_LIMITS.free.convexFunctionCalls,
      compute: TIER_LIMITS.free.convexCompute,
      dbBW: TIER_LIMITS.free.convexDatabaseBW,
      fileBW: TIER_LIMITS.free.convexFileBW,
    }),
    ...sandboxes(SANDBOX_FEATURE_IDS, ["small"]),
    featureItem({
      feature_id: maxProjects.id,
      included_usage: TIER_LIMITS.free.maxProjects,
    }),
  ],
});

// --- Starter Plan ($3.99) ---
export const starterPlan = product({
  id: "starter_plan",
  name: "Starter",
  items: [
    ...price(PLAN_PRICES.starter),
    ...buildAgentCredits(agentCredits.id, TIER_LIMITS.starter.agentCredits),
    ...buildEmailCredits(emailIntegration.id, {
      included: TIER_LIMITS.starter.emailCredits,
    }),
    ...buildLlmCredits(llmIntegration.id, {
      included: TIER_LIMITS.starter.llmCredits,
    }),
    ...buildBooleanFeatures(STARTER_FEATURE_IDS),
    ...teamFeatures(TEAM_FEATURE_IDS, {
      totalMembers: TIER_LIMITS.starter.totalMembers,
    }),
    ...convexResources(CONVEX_FEATURE_IDS, {
      calls: TIER_LIMITS.starter.convexFunctionCalls,
      compute: TIER_LIMITS.starter.convexCompute,
      dbBW: TIER_LIMITS.starter.convexDatabaseBW,
      fileBW: TIER_LIMITS.starter.convexFileBW,
    }),
    ...sandboxes(SANDBOX_FEATURE_IDS, ["small"]),
    featureItem({
      feature_id: maxProjects.id,
      included_usage: TIER_LIMITS.starter.maxProjects,
    }),
    featureItem({
      feature_id: communityBadge.id,
      included_usage: TIER_LIMITS.starter.communityBadgeTier,
    }),
  ],
});

// --- Hobby Plan ($12) ---
export const hobbyPlan = product({
  id: "hobby_plan",
  name: "Hobby",
  items: [
    ...price(PLAN_PRICES.hobby),
    ...buildAgentCredits(agentCredits.id, TIER_LIMITS.hobby.agentCredits),
    ...buildEmailCredits(emailIntegration.id, {
      included: TIER_LIMITS.hobby.emailCredits,
    }),
    ...buildLlmCredits(llmIntegration.id, {
      included: TIER_LIMITS.hobby.llmCredits,
    }),
    ...buildBooleanFeatures(HOBBY_FEATURE_IDS),
    ...teamFeatures(TEAM_FEATURE_IDS, {
      totalMembers: TIER_LIMITS.hobby.totalMembers,
    }),
    ...convexResources(CONVEX_FEATURE_IDS, {
      calls: TIER_LIMITS.hobby.convexFunctionCalls,
      compute: TIER_LIMITS.hobby.convexCompute,
      dbBW: TIER_LIMITS.hobby.convexDatabaseBW,
      fileBW: TIER_LIMITS.hobby.convexFileBW,
    }),
    ...sandboxes(SANDBOX_FEATURE_IDS, ["small", "medium"]),
    featureItem({
      feature_id: maxProjects.id,
      included_usage: TIER_LIMITS.hobby.maxProjects,
    }),
    featureItem({
      feature_id: communityBadge.id,
      included_usage: TIER_LIMITS.hobby.communityBadgeTier,
    }),
  ],
});

// --- Business Plan ($23) - Best Value ---
export const businessPlan = product({
  id: "business_plan",
  name: "Business",
  items: [
    ...price(PLAN_PRICES.business),
    ...buildAgentCredits(agentCredits.id, TIER_LIMITS.business.agentCredits),
    ...buildEmailCredits(emailIntegration.id, {
      included: TIER_LIMITS.business.emailCredits,
      priced: true,
    }),
    ...buildLlmCredits(llmIntegration.id, {
      included: TIER_LIMITS.business.llmCredits,
      priced: true,
    }),
    ...buildBooleanFeatures(BUSINESS_FEATURE_IDS),
    ...teamFeatures(TEAM_FEATURE_IDS, {
      totalMembers: TIER_LIMITS.business.totalMembers,
    }),
    ...convexResources(CONVEX_FEATURE_IDS, {
      calls: TIER_LIMITS.business.convexFunctionCalls,
      compute: TIER_LIMITS.business.convexCompute,
      dbBW: TIER_LIMITS.business.convexDatabaseBW,
      fileBW: TIER_LIMITS.business.convexFileBW,
    }),
    ...sandboxes(SANDBOX_FEATURE_IDS, ["small", "medium", "large"]),
    featureItem({
      feature_id: maxProjects.id,
      included_usage: TIER_LIMITS.business.maxProjects,
    }),
    featureItem({
      feature_id: communityBadge.id,
      included_usage: TIER_LIMITS.business.communityBadgeTier,
    }),
  ],
});

// --- Scale Plan ($55) ---
export const scalePlan = product({
  id: "scale_plan",
  name: "Scale",
  items: [
    ...price(PLAN_PRICES.scale),
    ...buildAgentCredits(agentCredits.id, TIER_LIMITS.scale.agentCredits),
    ...buildEmailCredits(emailIntegration.id, {
      included: TIER_LIMITS.scale.emailCredits,
      priced: true,
    }),
    ...buildLlmCredits(llmIntegration.id, {
      included: TIER_LIMITS.scale.llmCredits,
      priced: true,
    }),
    ...buildBooleanFeatures(SCALE_FEATURE_IDS),
    ...teamFeatures(TEAM_FEATURE_IDS, {
      seats: TIER_LIMITS.scale.teamSeats,
      totalMembers: TIER_LIMITS.scale.totalMembers,
    }),
    ...convexResources(CONVEX_FEATURE_IDS, {
      calls: TIER_LIMITS.scale.convexFunctionCalls,
      compute: TIER_LIMITS.scale.convexCompute,
      dbBW: TIER_LIMITS.scale.convexDatabaseBW,
      fileBW: TIER_LIMITS.scale.convexFileBW,
    }),
    ...sandboxes(SANDBOX_FEATURE_IDS, ["small", "medium", "large"]),
    featureItem({
      feature_id: maxProjects.id,
      included_usage: TIER_LIMITS.scale.maxProjects,
    }),
    featureItem({
      feature_id: communityBadge.id,
      included_usage: TIER_LIMITS.scale.communityBadgeTier,
    }),
  ],
});

// --- Priority Plan ($92) - Hidden ---
export const priorityPlan = product({
  id: "priority_plan",
  name: "Priority",
  items: [
    ...price(PLAN_PRICES.priority),
    ...buildAgentCredits(agentCredits.id, TIER_LIMITS.priority.agentCredits),
    ...buildEmailCredits(emailIntegration.id, {
      included: TIER_LIMITS.priority.emailCredits,
      priced: true,
    }),
    ...buildLlmCredits(llmIntegration.id, {
      included: TIER_LIMITS.priority.llmCredits,
      priced: true,
    }),
    ...buildBooleanFeatures(PRIORITY_FEATURE_IDS),
    ...teamFeatures(TEAM_FEATURE_IDS, {
      seats: TIER_LIMITS.priority.teamSeats,
      totalMembers: TIER_LIMITS.priority.totalMembers,
    }),
    ...convexResources(CONVEX_FEATURE_IDS, {
      calls: TIER_LIMITS.priority.convexFunctionCalls,
      compute: TIER_LIMITS.priority.convexCompute,
      dbBW: TIER_LIMITS.priority.convexDatabaseBW,
      fileBW: TIER_LIMITS.priority.convexFileBW,
    }),
    ...sandboxes(SANDBOX_FEATURE_IDS, ["small", "medium", "large"]),
    featureItem({
      feature_id: maxProjects.id,
      included_usage: TIER_LIMITS.priority.maxProjects,
    }),
    featureItem({
      feature_id: communityBadge.id,
      included_usage: TIER_LIMITS.priority.communityBadgeTier,
    }),
  ],
});

// --- Ultra Plan ($180) - Hidden ---
export const ultraPlan = product({
  id: "ultra_plan",
  name: "Ultra",
  items: [
    ...price(PLAN_PRICES.ultra),
    ...buildAgentCredits(agentCredits.id, TIER_LIMITS.ultra.agentCredits),
    ...buildEmailCredits(emailIntegration.id, {
      included: TIER_LIMITS.ultra.emailCredits,
      priced: true,
    }),
    ...buildLlmCredits(llmIntegration.id, {
      included: TIER_LIMITS.ultra.llmCredits,
      priced: true,
    }),
    ...buildBooleanFeatures(ULTRA_FEATURE_IDS),
    ...teamFeatures(TEAM_FEATURE_IDS, {
      seats: TIER_LIMITS.ultra.teamSeats,
      totalMembers: TIER_LIMITS.ultra.totalMembers,
    }),
    ...convexResources(CONVEX_FEATURE_IDS, {
      calls: TIER_LIMITS.ultra.convexFunctionCalls,
      compute: TIER_LIMITS.ultra.convexCompute,
      dbBW: TIER_LIMITS.ultra.convexDatabaseBW,
      fileBW: TIER_LIMITS.ultra.convexFileBW,
    }),
    ...sandboxes(SANDBOX_FEATURE_IDS, ["small", "medium", "large"]),
    featureItem({
      feature_id: maxProjects.id,
      included_usage: TIER_LIMITS.ultra.maxProjects,
    }),
    featureItem({
      feature_id: communityBadge.id,
      included_usage: TIER_LIMITS.ultra.communityBadgeTier,
    }),
  ],
});

// --- Max Plan ($350) - Hidden ---
export const maxPlan = product({
  id: "max_plan",
  name: "Max",
  items: [
    ...price(PLAN_PRICES.max),
    ...buildAgentCredits(agentCredits.id, TIER_LIMITS.max.agentCredits),
    ...buildEmailCredits(emailIntegration.id, {
      included: TIER_LIMITS.max.emailCredits,
      priced: true,
    }),
    ...buildLlmCredits(llmIntegration.id, {
      included: TIER_LIMITS.max.llmCredits,
      priced: true,
    }),
    ...buildBooleanFeatures(MAX_FEATURE_IDS),
    ...teamFeatures(TEAM_FEATURE_IDS, {
      seats: TIER_LIMITS.max.teamSeats,
      totalMembers: "inf",
    }),
    ...convexResources(CONVEX_FEATURE_IDS, {
      calls: TIER_LIMITS.max.convexFunctionCalls,
      compute: TIER_LIMITS.max.convexCompute,
      dbBW: TIER_LIMITS.max.convexDatabaseBW,
      fileBW: TIER_LIMITS.max.convexFileBW,
    }),
    ...sandboxes(SANDBOX_FEATURE_IDS, ["small", "medium", "large"]),
    featureItem({
      feature_id: maxProjects.id,
      included_usage: TIER_LIMITS.max.maxProjects,
    }),
    featureItem({
      feature_id: communityBadge.id,
      included_usage: TIER_LIMITS.max.communityBadgeTier,
    }),
  ],
});

// --- Unlimited Plan ($600) - Hidden ---
export const unlimitedPlan = product({
  id: "unlimited_plan",
  name: "Unlimited",
  items: [
    ...price(PLAN_PRICES.unlimited),
    ...buildAgentCredits(agentCredits.id, TIER_LIMITS.unlimited.agentCredits),
    ...buildEmailCredits(emailIntegration.id, {
      included: TIER_LIMITS.unlimited.emailCredits,
      priced: true,
    }),
    ...buildLlmCredits(llmIntegration.id, {
      included: TIER_LIMITS.unlimited.llmCredits,
      priced: true,
    }),
    ...buildBooleanFeatures(UNLIMITED_FEATURE_IDS),
    ...teamFeatures(TEAM_FEATURE_IDS, {
      seats: TIER_LIMITS.unlimited.teamSeats,
      totalMembers: "inf",
    }),
    ...convexResources(CONVEX_FEATURE_IDS, {
      calls: TIER_LIMITS.unlimited.convexFunctionCalls,
      compute: TIER_LIMITS.unlimited.convexCompute,
      dbBW: TIER_LIMITS.unlimited.convexDatabaseBW,
      fileBW: TIER_LIMITS.unlimited.convexFileBW,
    }),
    ...sandboxes(SANDBOX_FEATURE_IDS, ["small", "medium", "large"]),
    featureItem({
      feature_id: maxProjects.id,
      included_usage: TIER_LIMITS.unlimited.maxProjects,
    }),
    featureItem({
      feature_id: communityBadge.id,
      included_usage: TIER_LIMITS.unlimited.communityBadgeTier,
    }),
  ],
});

// --- Enterprise Plan ---
// Enterprise is "contact sales" (PLAN_PRICES.enterprise === 0). Autumn API requires
// price > 0; use $1 placeholder for sync. UI still shows "Custom" via PLAN_PRICES.
const ENTERPRISE_AUTUMN_PRICE = 1;

export const enterprisePlan = product({
  id: "enterprise_plan",
  name: "Enterprise",
  items: [
    ...price(ENTERPRISE_AUTUMN_PRICE),
    ...buildAgentCredits(agentCredits.id, TIER_LIMITS.enterprise.agentCredits),
    ...buildEmailCredits(emailIntegration.id, {
      included: TIER_LIMITS.enterprise.emailCredits,
      priced: true,
    }),
    ...buildLlmCredits(llmIntegration.id, {
      included: TIER_LIMITS.enterprise.llmCredits,
      priced: true,
    }),
    ...buildBooleanFeatures(ALL_BOOLEAN_FEATURE_IDS),
    ...teamFeatures(TEAM_FEATURE_IDS, {
      seats: TIER_LIMITS.enterprise.teamSeats,
      totalMembers: "inf",
    }),
    ...convexResources(CONVEX_FEATURE_IDS, {
      calls: TIER_LIMITS.enterprise.convexFunctionCalls,
      compute: TIER_LIMITS.enterprise.convexCompute,
      dbBW: TIER_LIMITS.enterprise.convexDatabaseBW,
      fileBW: TIER_LIMITS.enterprise.convexFileBW,
    }),
    ...sandboxes(SANDBOX_FEATURE_IDS, ["small", "medium", "large"]),
    featureItem({
      feature_id: maxProjects.id,
      included_usage: "inf",
    }),
    featureItem({
      feature_id: communityBadge.id,
      included_usage: TIER_LIMITS.enterprise.communityBadgeTier,
    }),
  ],
});
