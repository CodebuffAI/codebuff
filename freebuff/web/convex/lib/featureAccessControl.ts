/**
 * Feature Access Control for Convex Backend
 *
 * Resilient utilities for enforcing feature access in Convex functions.
 * Uses a two-layer approach matching the client-side pattern:
 *   1. Primary: Autumn SDK check (autumn.check)
 *   2. Fallback: Autumn REST API → customer.features + plan-based tier check
 *
 * NOTE: This file maintains its own copy of feature IDs because Convex backend
 * cannot import from frontend code. Keep in sync with autumn/constants.ts!
 *
 * SOURCE OF TRUTH: autumn/constants.ts
 */

import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { autumn } from "../autumn";

const BILLING_DISABLED_FOR_MIGRATION = true;

/**
 * Boolean feature IDs from autumn/constants.ts
 * KEEP IN SYNC with the frontend source of truth!
 *
 * Tier structure:
 * - Starter ($3.99): documentation_visualizer, database_preview, no_vlyai_branding, custom_domains
 * - Hobby ($12): + team_collaboration, integrations_library, project_code_editor, agent_context_length
 * - Business ($23): + github_integration, convex_logs, cli_agent_access, in_app_support, private_projects
 * - Scale ($55): + claude_opus_access, ui_components_library, theme_customization, data_transfer
 * - Priority ($92): + personal_phone_support
 * - Ultra ($180): + hire_developers
 * - Max ($350): (limited projects, no new boolean)
 * - Unlimited ($600): + unlimited_projects
 */
export const BOOLEAN_FEATURE_IDS = {
  // Starter tier ($3.99)
  DOCUMENTATION_VISUALIZER: "documentation_visualizer",
  DATABASE_PREVIEW: "database_preview",
  NO_VLYAI_BRANDING: "no_vlyai_branding",
  CUSTOM_DOMAINS: "custom_domains",

  // Hobby tier ($12)
  TEAM_COLLABORATION: "team_collaboration",
  INTEGRATIONS_LIBRARY: "integrations_library",
  PROJECT_CODE_EDITOR: "project_code_editor",
  AGENT_CONTEXT_LENGTH: "agent_context_length",

  // Business tier ($23)
  GITHUB_INTEGRATION: "github_integration",
  CONVEX_LOGS: "convex_logs",
  CLI_AGENT_ACCESS: "cli_agent_access",
  IN_APP_SUPPORT: "in_app_support",
  PRIVATE_PROJECTS: "private_projects",

  // Scale tier ($55)
  CLAUDE_OPUS_ACCESS: "claude_opus_access",
  UI_COMPONENTS_LIBRARY: "ui_components_library",
  THEME_CUSTOMIZATION: "theme_customization",
  DATA_TRANSFER: "data_transfer",

  // Priority tier ($92) - Hidden
  PERSONAL_PHONE_SUPPORT: "personal_phone_support",

  // Ultra tier ($180) - Hidden
  HIRE_DEVELOPERS: "hire_developers",

  // Max tier ($350) - Hidden
  UNLIMITED_PROJECTS: "unlimited_projects",
} as const;

export type BooleanFeatureId =
  (typeof BOOLEAN_FEATURE_IDS)[keyof typeof BOOLEAN_FEATURE_IDS];

/**
 * Feature display names for error messages
 */
const FEATURE_DISPLAY_NAMES: Record<string, string> = {
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

/**
 * Minimum required tier display name for error messages
 */
const FEATURE_MINIMUM_TIER: Record<string, string> = {
  documentation_visualizer: "Starter",
  database_preview: "Starter",
  no_vlyai_branding: "Starter",
  custom_domains: "Starter",
  team_collaboration: "Hobby",
  integrations_library: "Hobby",
  project_code_editor: "Hobby",
  agent_context_length: "Hobby",
  github_integration: "Business",
  convex_logs: "Business",
  cli_agent_access: "Business",
  in_app_support: "Business",
  private_projects: "Business",
  claude_opus_access: "Scale",
  ui_components_library: "Scale",
  theme_customization: "Scale",
  data_transfer: "Scale",
  personal_phone_support: "Priority",
  hire_developers: "Ultra",
  unlimited_projects: "Unlimited",
};

// ============================================================================
// Resilient Fallback Infrastructure
// ============================================================================

const TIER_ORDER = [
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

const FEATURE_REQUIRED_TIER: Record<string, string> = {
  documentation_visualizer: "starter",
  database_preview: "starter",
  no_vlyai_branding: "starter",
  custom_domains: "starter",
  team_collaboration: "hobby",
  integrations_library: "hobby",
  project_code_editor: "hobby",
  agent_context_length: "hobby",
  github_integration: "business",
  convex_logs: "business",
  cli_agent_access: "business",
  in_app_support: "business",
  private_projects: "business",
  claude_opus_access: "scale",
  ui_components_library: "scale",
  theme_customization: "scale",
  data_transfer: "scale",
  personal_phone_support: "priority",
  hire_developers: "ultra",
  unlimited_projects: "unlimited",
};

const PLAN_ID_TO_TIER: Record<string, string> = {
  free_plan: "free",
  starter_plan: "starter",
  hobby_plan: "hobby",
  business_plan: "business",
  scale_plan: "scale",
  priority_plan: "priority",
  ultra_plan: "ultra",
  max_plan: "max",
  unlimited_plan: "unlimited",
  enterprise_plan: "enterprise",
  hobby_custom_plan: "hobby",
  pro_plan: "business",
  pro_custom_plan: "business",
  team_plan: "scale",
  team_custom_plan: "scale",
  enterprise_custom_plan: "enterprise",
};

function isTierAtOrAbove(userTier: string, requiredTier: string): boolean {
  const userIndex = TIER_ORDER.indexOf(userTier);
  const requiredIndex = TIER_ORDER.indexOf(requiredTier);
  if (userIndex === -1 || requiredIndex === -1) return false;
  return userIndex >= requiredIndex;
}

function inferTierFromPlanName(name?: string): string | null {
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

function getTierFromProducts(products: any[] | undefined): string {
  if (!products || !Array.isArray(products)) return "free";

  const now = Date.now();

  const activePlans = products.filter((p: any) => {
    if (p?.is_add_on) return false;
    if (p?.status === "active" || p?.scenario === "active") return true;
    return !!(
      p?.canceled_at &&
      p?.current_period_end &&
      now < p.current_period_end
    );
  });

  const activePlan = activePlans.sort((a: any, b: any) => {
    const aTier = PLAN_ID_TO_TIER[a.id] ?? inferTierFromPlanName(a.name);
    const bTier = PLAN_ID_TO_TIER[b.id] ?? inferTierFromPlanName(b.name);
    const aRank = aTier ? TIER_ORDER.indexOf(aTier) : -1;
    const bRank = bTier ? TIER_ORDER.indexOf(bTier) : -1;
    return bRank - aRank;
  })[0];

  if (!activePlan) {
    const scheduledPlan = products.find(
      (p: any) =>
        p?.scenario === "scheduled" ||
        (p.canceled_at && p.current_period_end && now < p.current_period_end),
    );
    if (scheduledPlan) return PLAN_ID_TO_TIER[scheduledPlan.id] || "free";
    return "free";
  }

  return PLAN_ID_TO_TIER[activePlan.id] || "free";
}

async function fetchCustomerData(customerId: string): Promise<any | null> {
  try {
    const response = await fetch(
      `https://api.useautumn.com/v1/customers/${customerId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.AUTUMN_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function getCustomerIdFromIdentity(identity: any): string | null {
  if (!identity) return null;
  const clerkUserId = identity.subject;
  const organizationId =
    identity?.org_id ||
    identity?.organizationId ||
    identity?.organization?.id ||
    identity?.activeOrganizationId;
  return organizationId || clerkUserId || null;
}

function checkFeatureInCustomerData(
  customerData: any,
  featureId: string,
): boolean {
  if (customerData.features?.[featureId]) {
    const feature = customerData.features[featureId];
    if ("has_access" in feature) return feature.has_access === true;
    return true;
  }

  const tier = getTierFromProducts(customerData.products);
  const requiredTier = FEATURE_REQUIRED_TIER[featureId];
  if (!requiredTier) return false;
  return isTierAtOrAbove(tier, requiredTier);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Resilient feature access check.
 *
 * 1. Tries Autumn SDK check (works in all Convex contexts)
 * 2. If SDK returns allowed=true, returns true immediately
 * 3. If SDK fails or returns false, falls back to REST API check
 *    (only available in action contexts; returns SDK result in query/mutation)
 */
export async function hasFeatureAccess(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  featureId: BooleanFeatureId | string,
): Promise<boolean> {
  if (BILLING_DISABLED_FOR_MIGRATION) {
    return true;
  }

  try {
    const { data, error } = await autumn.check(ctx, { featureId });
    if (!error && data && "allowed" in data && data.allowed === true) {
      return true;
    }
  } catch (sdkError) {
    console.warn(
      `[FeatureAccess] SDK check failed for ${featureId}:`,
      sdkError,
    );
  }

  try {
    const identity = await (ctx as any).auth?.getUserIdentity?.();
    const customerId = getCustomerIdFromIdentity(identity);
    if (!customerId) return false;

    const customerData = await fetchCustomerData(customerId);
    if (!customerData) return false;

    return checkFeatureInCustomerData(customerData, featureId);
  } catch {
    return false;
  }
}

/**
 * Check feature access for a specific Autumn customer ID.
 * Uses the REST API directly — no auth context needed.
 * Only works in action contexts (requires fetch).
 */
export async function hasFeatureAccessForCustomer(
  customerId: string,
  featureId: string,
): Promise<boolean> {
  if (BILLING_DISABLED_FOR_MIGRATION) {
    return true;
  }

  try {
    const customerData = await fetchCustomerData(customerId);
    if (!customerData) return false;
    return checkFeatureInCustomerData(customerData, featureId);
  } catch {
    return false;
  }
}

/**
 * Check feature access and return a result object with error details.
 */
export async function requireFeatureAccess(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  featureId: BooleanFeatureId | string,
) {
  const hasAccess = await hasFeatureAccess(ctx, featureId);

  if (hasAccess) {
    return { success: true as const };
  }

  const featureName = FEATURE_DISPLAY_NAMES[featureId] ?? featureId;
  const requiredPlan = FEATURE_MINIMUM_TIER[featureId] ?? "a paid plan";

  return {
    success: false as const,
    featureId,
    featureName,
    requiredPlan,
    message: `${featureName} is not available on your current plan. Upgrade to ${requiredPlan} or higher to access this feature.`,
  };
}

/**
 * Check if user has access to all specified features
 */
export async function hasAllFeaturesAccess(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  featureIds: (BooleanFeatureId | string)[],
): Promise<boolean> {
  const results = await Promise.all(
    featureIds.map((id) => hasFeatureAccess(ctx, id)),
  );
  return results.every((hasAccess) => hasAccess);
}

/**
 * Get display name for a feature
 */
export function getFeatureDisplayName(featureId: string): string {
  return FEATURE_DISPLAY_NAMES[featureId] ?? featureId;
}

/**
 * Get minimum required tier for a feature
 */
export function getFeatureMinimumTier(featureId: string): string | null {
  return FEATURE_MINIMUM_TIER[featureId] ?? null;
}
