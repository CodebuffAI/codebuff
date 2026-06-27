import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import { DataModel } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";

/**
 * Helper function to get the day string (YYYY-MM-DD) from a timestamp
 * Uses UTC to ensure consistency across timezones
 */
function getDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Aggregate users by creation day
 * This allows us to efficiently count users created on any given day
 */
export const usersByDay = new TableAggregate<{
  Key: [string]; // Day key in format YYYY-MM-DD
  DataModel: DataModel;
  TableName: "users";
}>(components.usersByDayAggregate, {
  sortKey: (doc) => [getDayKey(doc._creationTime)],
});

/**
 * Aggregate projects by creation day
 * This allows us to efficiently count projects created on any given day
 */
export const projectsByDay = new TableAggregate<{
  Key: [string]; // Day key in format YYYY-MM-DD
  DataModel: DataModel;
  TableName: "project";
}>(components.projectsByDayAggregate, {
  sortKey: (doc) => [getDayKey(doc._creationTime)],
});

/**
 * Aggregate all users (no partitioning)
 * This gives us a total user count
 */
export const allUsers = new TableAggregate<{
  Key: []; // Empty key = no partitioning
  DataModel: DataModel;
  TableName: "users";
}>(components.allUsersAggregate, {
  sortKey: () => [],
});

/**
 * Aggregate user_activity rows keyed by last_active_at.
 * Lets us count "users active since T" (e.g. live users in the past hour)
 * as an O(log n) range count. One row per user, so counts are unique users.
 */
export const userActivityByTime = new TableAggregate<{
  Key: [number]; // last_active_at (ms timestamp)
  DataModel: DataModel;
  TableName: "user_activity";
}>(components.userActivityAggregate, {
  sortKey: (doc) => [doc.last_active_at],
});

/**
 * Aggregate user_activity_daily rows keyed by day.
 * One row per (user, day), so a prefix count for a day = unique active users
 * that day (DAU) without any table scan.
 */
export const activeUsersByDay = new TableAggregate<{
  Key: [string]; // Day key in format YYYY-MM-DD
  DataModel: DataModel;
  TableName: "user_activity_daily";
}>(components.activeUsersByDayAggregate, {
  sortKey: (doc) => [doc.day],
});

/**
 * Aggregate all projects (no partitioning)
 * This gives us a total project count
 */
export const allProjects = new TableAggregate<{
  Key: []; // Empty key = no partitioning
  DataModel: DataModel;
  TableName: "project";
}>(components.allProjectsAggregate, {
  sortKey: () => [],
});

/**
 * Aggregate cloud_user_activity_daily rows keyed by day.
 * One row per (user, day) for Freebuff Cloud (connected_repo) sends, so a
 * prefix count for a day = unique Cloud-active users that day (Cloud DAU)
 * without any table scan.
 */
export const cloudActiveUsersByDay = new TableAggregate<{
  Key: [string]; // Day key in format YYYY-MM-DD
  DataModel: DataModel;
  TableName: "cloud_user_activity_daily";
}>(components.cloudActiveUsersByDayAggregate, {
  sortKey: (doc) => [doc.day],
});

/**
 * Aggregate projects keyed by [project_type, creation-day]. Lets us answer
 * "total connected_repo projects" (prefix ["connected_repo"]) and "new
 * connected_repo projects on day X" (prefix ["connected_repo", X]) as O(log n)
 * aggregate counts — no scan, no by_project_type collect. Templates (project
 * with no project_type) bucket under "template".
 */
export const cloudProjectsByTypeDay = new TableAggregate<{
  Key: [string, string]; // [project_type, day]
  DataModel: DataModel;
  TableName: "project";
}>(components.cloudProjectsByTypeDayAggregate, {
  sortKey: (doc) => [doc.project_type ?? "template", getDayKey(doc._creationTime)],
});

/**
 * Aggregate users by role (god, admin, member)
 * This allows us to efficiently count users by their role
 */
export const usersByRole = new TableAggregate<{
  Key: [string]; // Role: "god", "admin", "member", or "undefined"
  DataModel: DataModel;
  TableName: "users";
}>(components.usersByRoleAggregate, {
  sortKey: (doc) => [doc.role || "undefined"],
});

/**
 * Aggregate users by tier (free, pro)
 * This allows us to efficiently count users by their subscription tier
 */
export const usersByTier = new TableAggregate<{
  Key: [string]; // Tier: "free", "pro", or "undefined"
  DataModel: DataModel;
  TableName: "users";
}>(components.usersByTierAggregate, {
  sortKey: (doc) => [doc.tier || "free"], // Default to "free" for undefined
});

/**
 * Aggregate all project_convex_instance (deployments)
 * This gives us a total deployment count
 */
export const allConvexInstances = new TableAggregate<{
  Key: []; // Empty key = no partitioning
  DataModel: DataModel;
  TableName: "project_convex_instance";
}>(components.allConvexInstancesAggregate, {
  sortKey: () => [],
});

/**
 * Aggregate paused_projects by active status
 * This allows us to count active vs inactive paused projects
 */
export const pausedProjectsByActive = new TableAggregate<{
  Key: [string]; // "true" or "false"
  DataModel: DataModel;
  TableName: "paused_projects";
}>(components.pausedProjectsByActiveAggregate, {
  sortKey: (doc) => [String(doc.active)],
});

/**
 * Aggregate paused_users by active status
 * This allows us to count active vs inactive paused users
 */
export const pausedUsersByActive = new TableAggregate<{
  Key: [string]; // "true" or "false"
  DataModel: DataModel;
  TableName: "paused_users";
}>(components.pausedUsersByActiveAggregate, {
  sortKey: (doc) => [String(doc.active)],
});

/**
 * Helper function to get today's day key in UTC
 */
export function getTodayKey(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Helper function to get day key for N days ago in UTC
 */
export function getDayKeyForDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Optimized helper to compute rolling window totals (24h, 7d, 30d)
 * Returns pre-calculated sums instead of requiring client-side reduction
 *
 * @param dayCounts - Array of day counts from countBatch (must be at least 30 elements)
 * @returns Object with 24h, 7d, and 30d totals
 */
export function computeRollingWindows(dayCounts: number[]): {
  total24h: number;
  total7d: number;
  total30d: number;
} {
  // Ensure we have enough data
  if (dayCounts.length < 30) {
    console.warn(
      `computeRollingWindows expected 30+ days, got ${dayCounts.length}`,
    );
  }

  // Calculate totals for each window
  const total24h = dayCounts[0] || 0; // Today only
  const total7d = dayCounts.slice(0, 7).reduce((sum, count) => sum + count, 0);
  const total30d = dayCounts
    .slice(0, 30)
    .reduce((sum, count) => sum + count, 0);

  return { total24h, total7d, total30d };
}

/**
 * Clear all aggregate data structures
 * Use this when aggregate data is corrupt or out of sync
 */
export const clearAllAggregates = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Clear each aggregate data structure
    await allUsers.clear(ctx);
    await usersByRole.clear(ctx);
    await usersByTier.clear(ctx);
    await usersByDay.clear(ctx);
    await allProjects.clear(ctx);
    await projectsByDay.clear(ctx);
    await allConvexInstances.clear(ctx);
    await pausedProjectsByActive.clear(ctx);
    await pausedUsersByActive.clear(ctx);
    await userActivityByTime.clear(ctx);
    await activeUsersByDay.clear(ctx);
    await cloudActiveUsersByDay.clear(ctx);
    await cloudProjectsByTypeDay.clear(ctx);

    console.log("✅ All aggregate data structures cleared");
  },
});

/**
 * Query functions to get actual aggregate counts
 * Used by migrations to report accurate statistics
 */
export const countAllUsers = internalQuery({
  args: {},
  handler: async (ctx): Promise<number> => {
    return await allUsers.count(ctx, { bounds: {} });
  },
});

export const countAllProjects = internalQuery({
  args: {},
  handler: async (ctx): Promise<number> => {
    return await allProjects.count(ctx, { bounds: {} });
  },
});

export const countAllConvexInstances = internalQuery({
  args: {},
  handler: async (ctx): Promise<number> => {
    return await allConvexInstances.count(ctx, { bounds: {} });
  },
});

export const countPausedProjects = internalQuery({
  args: {},
  handler: async (ctx): Promise<number> => {
    return await pausedProjectsByActive.count(ctx, {
      bounds: { prefix: ["true"] },
    });
  },
});

export const countPausedUsers = internalQuery({
  args: {},
  handler: async (ctx): Promise<number> => {
    return await pausedUsersByActive.count(ctx, {
      bounds: { prefix: ["true"] },
    });
  },
});
