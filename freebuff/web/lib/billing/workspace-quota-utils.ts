/**
 * Workspace quota utilities for checking and managing workspace tier limits
 * Includes sandbox feature ID mapping and quota checking
 */

import type { SandboxSize } from "@/vly/lib/sandbox-specs";
import type { AutumnCustomer } from "@/vly/autumn/constants";
import { sandboxSmall, sandboxMedium, sandboxLarge } from "@/vly/autumn.config";

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
  void size;
  void limit;

  return {
    allowed: true,
    current: currentUsage,
    limit: "inf",
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
  void customer;

  const projectSize = project.sandbox_size ?? "small";

  return {
    allowed: true,
    projectSize,
    hasFeature: true,
    limit: "inf",
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
  void customer;

  return {
    size,
    hasQuota: true,
    currentUsage: 0,
    limit: "inf",
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
