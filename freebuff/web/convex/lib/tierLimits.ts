/**
 * Max projects per tier for Convex backend checks.
 * Keep in sync with autumn/constants.ts TIER_LIMITS.maxProjects.
 * Convex users table only has tier "free" | "pro"; "pro" maps to paid tiers (e.g. business = 10).
 */
export const MAX_PROJECTS_BY_TIER: Record<string, number> = {
  free: 2,
  pro: 10,
};

export function getMaxProjectsForTier(tier: string | undefined): number {
  if (!tier) return MAX_PROJECTS_BY_TIER.free;
  return MAX_PROJECTS_BY_TIER[tier] ?? MAX_PROJECTS_BY_TIER.free;
}
