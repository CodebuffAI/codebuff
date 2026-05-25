/**
 * Workspace quota utilities for checking and managing workspace tier limits
 * Includes sandbox feature ID mapping and quota checking
 */

import type { SandboxSize } from "@/lib/sandbox-specs";
import type { AutumnCustomer } from "@/autumn/constants";
import { sandboxSmall, sandboxMedium, sandboxLarge } from "@/autumn.config";

// ============================================================================
// Sandbox Feature ID Mapping
// ============================================================================

/**
 * Maps sandbox size to Autumn feature ID
 */
export function getSandboxFeatureId(size: SandboxSize): string {
  switch (size) {
    case "small":
      return sandboxSmall.id;
    case "medium":
      return sandboxMedium.id;
    case "large":
      return sandboxLarge.id;
    default:
      // This should never happen with proper typing
      return sandboxSmall.id;
  }
}

/**
 * Result of checking sandbox quota
 */
export type SandboxQuotaCheck = {
  allowed: boolean;
  current: number;
  limit: number | "inf"; // "inf" means unlimited
  reason?: string;
};

/**
 * Checks if a user can upgrade/create a sandbox of a given size
 * This function should be called from the frontend with Autumn data
 */
export function checkSandboxQuota(
  size: SandboxSize,
  currentUsage: number,
  limit: number | "inf",
): SandboxQuotaCheck {
  // "inf" means unlimited
  if (limit === "inf") {
    return {
      allowed: true,
      current: currentUsage,
      limit: "inf",
    };
  }

  const allowed = currentUsage < limit;

  return {
    allowed,
    current: currentUsage,
    limit,
    reason: allowed
      ? undefined
      : `You've reached your ${capitalize(size)} sandbox limit (${limit}). Upgrade your plan to create more.`,
  };
}

// ============================================================================
// Project Workspace Quota Checking
// ============================================================================

/**
 * Project type for quota checking (minimal required fields)
 */
export interface ProjectForQuotaCheck {
  sandbox_size?: "small" | "medium" | "large";
  _id: string;
}

/**
 * Result of checking if a project's workspace exceeds plan quota
 */
export interface ProjectWorkspaceQuotaCheck {
  allowed: boolean;
  projectSize: SandboxSize;
  reason?: string;
  hasFeature: boolean;
  currentUsage?: number;
  limit?: number | "inf";
}

/**
 * Available tier for downgrade
 */
export interface AvailableTier {
  size: SandboxSize;
  hasQuota: boolean;
  currentUsage: number;
  limit: number | "inf";
}

/**
 * Checks if a project's workspace tier is allowed by the user's current plan
 * This is used to determine if the project should be blocked from opening
 */
export function checkProjectWorkspaceQuota(
  project: ProjectForQuotaCheck,
  customer: AutumnCustomer | null | undefined,
): ProjectWorkspaceQuotaCheck {
  const projectSize = project.sandbox_size ?? "small";

  // Small workspaces are always allowed (unlimited for all plans)
  if (projectSize === "small") {
    return {
      allowed: true,
      projectSize: "small",
      hasFeature: true,
    };
  }

  // If no customer data, block medium/large workspaces
  if (!customer?.features) {
    return {
      allowed: false,
      projectSize,
      hasFeature: false,
      reason:
        "No active plan found. Please upgrade your plan or downgrade this workspace to Small.",
    };
  }

  const featureId = getSandboxFeatureId(projectSize);
  const feature = customer.features[
    featureId as keyof typeof customer.features
  ] as { included_usage?: number | "inf"; unlimited?: boolean } | undefined;

  // Check if feature exists in plan
  if (!feature) {
    return {
      allowed: false,
      projectSize,
      hasFeature: false,
      reason: `${capitalize(projectSize)} workspaces are not included in your plan. Please upgrade your plan or downgrade this workspace.`,
    };
  }

  // Check if feature is unlimited
  if (feature.unlimited || feature.included_usage === "inf") {
    return {
      allowed: true,
      projectSize,
      hasFeature: true,
      limit: "inf",
    };
  }

  // Check if feature has quota limit of 0 (not in plan)
  const limit = feature.included_usage ?? 0;
  if (limit === 0) {
    return {
      allowed: false,
      projectSize,
      hasFeature: false,
      limit: 0,
      reason: `${capitalize(projectSize)} workspaces are not included in your plan. Please upgrade your plan or downgrade this workspace.`,
    };
  }

  // If we have a numeric limit, we assume the project is already counted in usage
  // So we allow it (blocking would only happen if plan is downgraded)
  return {
    allowed: true,
    projectSize,
    hasFeature: true,
    limit,
  };
}

/**
 * Gets available tiers that the user can downgrade to based on their plan quota
 * Returns tiers in descending order (largest to smallest)
 */
export function getAvailableDowngradeTiers(
  currentSize: SandboxSize,
  customer: AutumnCustomer | null | undefined,
): AvailableTier[] {
  const sizes: SandboxSize[] = ["large", "medium", "small"];
  const availableTiers: AvailableTier[] = [];

  for (const size of sizes) {
    // Don't include current size or larger
    if (compareTierSize(size, currentSize) >= 0) {
      continue;
    }

    const tierInfo = getTierQuotaInfo(size, customer);
    availableTiers.push(tierInfo);
  }

  return availableTiers;
}

/**
 * Gets the highest tier that the user's plan allows
 * Returns "small" if no plan or only small is available
 */
export function getAutoDowngradeTier(
  customer: AutumnCustomer | null | undefined,
): SandboxSize {
  const sizes: SandboxSize[] = ["large", "medium", "small"];

  for (const size of sizes) {
    const tierInfo = getTierQuotaInfo(size, customer);
    if (tierInfo.hasQuota) {
      return size;
    }
  }

  // Fallback to small (always available)
  return "small";
}

/**
 * Gets quota information for a specific tier
 */
export function getTierQuotaInfo(
  size: SandboxSize,
  customer: AutumnCustomer | null | undefined,
): AvailableTier {
  // Small is always available (unlimited for all plans)
  if (size === "small") {
    return {
      size: "small",
      hasQuota: true,
      currentUsage: 0,
      limit: "inf",
    };
  }

  // If no customer data, only small is available
  if (!customer?.features) {
    return {
      size,
      hasQuota: false,
      currentUsage: 0,
      limit: 0,
    };
  }

  const featureId = getSandboxFeatureId(size);
  const feature = customer.features[
    featureId as keyof typeof customer.features
  ] as
    | { included_usage?: number | "inf"; unlimited?: boolean; usage?: number }
    | undefined;

  // No feature = no quota
  if (!feature) {
    return {
      size,
      hasQuota: false,
      currentUsage: 0,
      limit: 0,
    };
  }

  // Unlimited or "inf" = has quota
  if (feature.unlimited || feature.included_usage === "inf") {
    return {
      size,
      hasQuota: true,
      currentUsage: feature.usage ?? 0,
      limit: "inf",
    };
  }

  const limit = feature.included_usage ?? 0;
  const currentUsage = feature.usage ?? 0;

  return {
    size,
    hasQuota: limit > 0,
    currentUsage,
    limit,
  };
}

/**
 * Compares two tier sizes
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareTierSize(a: SandboxSize, b: SandboxSize): number {
  const order: Record<SandboxSize, number> = {
    small: 0,
    medium: 1,
    large: 2,
  };
  return order[a] - order[b];
}

/**
 * Checks if a tier change is an upgrade (target > current)
 */
export function isUpgrade(
  currentSize: SandboxSize,
  targetSize: SandboxSize,
): boolean {
  return compareTierSize(targetSize, currentSize) > 0;
}

/**
 * Checks if a tier change is a downgrade (target < current)
 */
export function isDowngrade(
  currentSize: SandboxSize,
  targetSize: SandboxSize,
): boolean {
  return compareTierSize(targetSize, currentSize) < 0;
}

/**
 * Capitalizes first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
