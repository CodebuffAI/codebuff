import { v } from "convex/values";

import { internalMutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthUser } from "./users";

/**
 * Tracking for who uses each Freebuff Cloud feature (publish, invite members,
 * integrations, custom links, AI credential connections). Writes are scheduled
 * via `recordCloudFeatureUsage` from each feature's backend entrypoint so a
 * tracking failure can never break the originating action.
 *
 * Storage is two-tiered, mirroring the existing admin-metrics pattern:
 *  - `cloud_feature_usage`        — per-event audit rows (who / when / which project)
 *  - `cloud_feature_usage_daily`  — O(1) per-(day, feature) counters for headline cards
 *
 * All admin reads are indexed and windowed — no full-table scans on page load.
 */

export const CLOUD_FEATURES = [
  "publish",
  "invite",
  "integration",
  "custom_link",
  "chatgpt_oauth",
  "openai_byok",
  "anthropic_byok",
  "bedrock_byok",
] as const;

export type CloudFeature = (typeof CLOUD_FEATURES)[number];

function utcDayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function utcDaysInRange(startTs: number, endTs: number): string[] {
  const days: string[] = [];
  const cursor = new Date(startTs);
  cursor.setUTCHours(0, 0, 0, 0);
  const endDay = utcDayKey(endTs);
  while (utcDayKey(cursor.getTime()) <= endDay) {
    days.push(utcDayKey(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * Record a single feature-usage event. Scheduled (runAfter 0) from each
 * feature's backend action/mutation. Inserts an audit row and bumps the
 * per-day counter, tracking unique users per (day, feature) cheaply.
 */
export const recordCloudFeatureUsage = internalMutation({
  args: {
    userId: v.id("users"),
    feature: v.string(),
    projectId: v.optional(v.id("project")),
    detail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const day = utcDayKey(now);

    // Has this user already used this feature today? Used to decide whether to
    // bump the unique-user counter on the daily aggregate.
    const priorToday = await ctx.db
      .query("cloud_feature_usage")
      .withIndex("by_user_and_feature", (q) =>
        q.eq("userId", args.userId).eq("feature", args.feature),
      )
      .filter((q) => q.eq(q.field("day"), day))
      .first();

    await ctx.db.insert("cloud_feature_usage", {
      userId: args.userId,
      feature: args.feature,
      projectId: args.projectId,
      day,
      detail: args.detail,
      created_at: now,
    });

    const daily = await ctx.db
      .query("cloud_feature_usage_daily")
      .withIndex("by_day_feature", (q) =>
        q.eq("day", day).eq("feature", args.feature),
      )
      .unique();

    if (daily) {
      await ctx.db.patch(daily._id, {
        count: daily.count + 1,
        unique_users: daily.unique_users + (priorToday ? 0 : 1),
      });
    } else {
      await ctx.db.insert("cloud_feature_usage_daily", {
        day,
        feature: args.feature,
        count: 1,
        unique_users: 1,
      });
    }

    return null;
  },
});

function parseTimestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const RECENT_EVENT_LIMIT = 100;

/**
 * Admin-only: feature-usage breakdown over a window, plus the most recent
 * individual events (who used what, when). Reads are bounded by indexes and a
 * hard event cap, so the dashboard never scans the full audit log.
 */
export const getCloudFeatureUsage = query({
  args: {
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await getAuthUser(ctx);
    if (!admin || (admin.role !== "god" && admin.role !== "admin")) {
      return null;
    }

    const endTs = parseTimestamp(args.endTime) ?? Date.now();
    const startTs =
      parseTimestamp(args.startTime) ?? endTs - 7 * 24 * 60 * 60 * 1000;
    const days = utcDaysInRange(startTs, endTs);

    // Per-feature totals from the daily counters (cheap, indexed by day).
    const totalsByFeature: Record<string, { count: number; uniqueUsers: number }> =
      {};
    for (const feature of CLOUD_FEATURES) {
      totalsByFeature[feature] = { count: 0, uniqueUsers: 0 };
    }
    for (const day of days) {
      const rows = await ctx.db
        .query("cloud_feature_usage_daily")
        .withIndex("by_day", (q) => q.eq("day", day))
        .collect();
      for (const row of rows) {
        if (!totalsByFeature[row.feature]) {
          totalsByFeature[row.feature] = { count: 0, uniqueUsers: 0 };
        }
        totalsByFeature[row.feature].count += row.count;
        // unique_users is per-day; summing across days double-counts a user who
        // returns on multiple days. That's an acceptable "active uses" proxy for
        // the dashboard headline; the recent-events table gives exact actors.
        totalsByFeature[row.feature].uniqueUsers += row.unique_users;
      }
    }

    // Most recent individual events across the window (newest first), capped.
    const recentRaw = await ctx.db
      .query("cloud_feature_usage")
      .withIndex("by_day", (q) =>
        q.gte("day", days[0]).lte("day", days[days.length - 1] ?? days[0]),
      )
      .order("desc")
      .take(RECENT_EVENT_LIMIT);

    const userCache = new Map<
      string,
      { name: string; email: string } | null
    >();
    const resolveUser = async (userId: Id<"users">) => {
      const key = userId as unknown as string;
      if (userCache.has(key)) return userCache.get(key)!;
      const user = await ctx.db.get(userId);
      const resolved = user
        ? { name: user.name ?? "Unknown", email: user.email ?? "" }
        : null;
      userCache.set(key, resolved);
      return resolved;
    };

    const recent = [];
    for (const event of recentRaw) {
      const user = await resolveUser(event.userId);
      recent.push({
        id: event._id as unknown as string,
        feature: event.feature,
        detail: event.detail ?? null,
        createdAt: event.created_at,
        userName: user?.name ?? "Unknown",
        userEmail: user?.email ?? "",
      });
    }

    return {
      window: {
        startTime: new Date(startTs).toISOString(),
        endTime: new Date(endTs).toISOString(),
        days: days.length,
      },
      totalsByFeature,
      recent,
    };
  },
});
