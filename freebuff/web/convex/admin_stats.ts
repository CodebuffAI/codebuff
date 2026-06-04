import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUser } from "./users";

const ACTIVITY_SOURCE_LIMIT = 30;
const MAX_ACTIVITY_ITEMS = 20;

function parseTimestamp(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isWithinRange(
  timestamp: number,
  startTimestamp?: number,
  endTimestamp?: number,
) {
  if (startTimestamp !== undefined && timestamp < startTimestamp) {
    return false;
  }
  if (endTimestamp !== undefined && timestamp > endTimestamp) {
    return false;
  }
  return true;
}

export const getDashboardStats = query({
  args: {
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const user = await getAuthUser(ctx);

      if (!user || (user.role !== "god" && user.role !== "admin")) {
        return null;
      }

      // Parse time range if provided (kept for API compatibility).
      const startTimestamp = parseTimestamp(args.startTime);
      const endTimestamp = parseTimestamp(args.endTime);

      let totalUsersCount = 0;
      let totalProjectsCount = 0;
      let todayUsersCount = 0;
      let todayProjectsCount = 0;

      try {
        // Lazy-load aggregates to avoid module-load failures crashing the query.
        const aggregates = await import("./aggregates/admin_aggregates");
        const todayKey = aggregates.getTodayKey();

        const [
          totalUsersResult,
          totalProjectsResult,
          todayUsersResult,
          todayProjectsResult,
        ] = await Promise.allSettled([
          aggregates.allUsers.count(ctx, { bounds: {} }),
          aggregates.allProjects.count(ctx, { bounds: {} }),
          aggregates.usersByDay.count(ctx, { bounds: { prefix: [todayKey] } }),
          aggregates.projectsByDay.count(ctx, {
            bounds: { prefix: [todayKey] },
          }),
        ]);

        totalUsersCount =
          totalUsersResult.status === "fulfilled" ? totalUsersResult.value : 0;
        totalProjectsCount =
          totalProjectsResult.status === "fulfilled"
            ? totalProjectsResult.value
            : 0;
        todayUsersCount =
          todayUsersResult.status === "fulfilled" ? todayUsersResult.value : 0;
        todayProjectsCount =
          todayProjectsResult.status === "fulfilled"
            ? todayProjectsResult.value
            : 0;
      } catch (aggregateError) {
        console.error(
          "[admin_stats.getDashboardStats] Aggregate fallback path triggered:",
          aggregateError,
        );

        const [usersStat, projectsStat] = await Promise.all([
          ctx.db
            .query("stats")
            .withIndex("by_name", (q) => q.eq("name", "users"))
            .unique(),
          ctx.db
            .query("stats")
            .withIndex("by_name", (q) => q.eq("name", "projects"))
            .unique(),
        ]);

        totalUsersCount = usersStat?.value ?? 0;
        totalProjectsCount = projectsStat?.value ?? 0;
        // No daily rollup fallback available without aggregate tables.
        todayUsersCount = 0;
        todayProjectsCount = 0;
      }

      return {
        totals: {
          users: totalUsersCount,
          projects: totalProjectsCount,
        },
        today: {
          users: todayUsersCount,
          projects: todayProjectsCount,
        },
        // Keep this field stable for callers while avoiding large-table scans.
        activity: {
          messages: [],
          hasTimeFilter:
            startTimestamp !== undefined || endTimestamp !== undefined,
        },
      };
    } catch (error) {
      console.error("[admin_stats.getDashboardStats] Failed:", error);
      return {
        totals: {
          users: 0,
          projects: 0,
        },
        today: {
          users: 0,
          projects: 0,
        },
        activity: {
          messages: [],
          hasTimeFilter: false,
        },
      };
    }
  },
});

export const getLiveActivityStream = query({
  args: {
    refresh: v.optional(v.number()), // for polling
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);

    if (!user || (user.role !== "god" && user.role !== "admin")) {
      return null;
    }

    const startTimestamp = parseTimestamp(args.startTime);
    const endTimestamp = parseTimestamp(args.endTime);

    // Use bounded queries to keep this endpoint fast and scalable.
    const [recentUsers, recentTickets] = await Promise.all([
      ctx.db.query("users").order("desc").take(ACTIVITY_SOURCE_LIMIT),
      ctx.db.query("tickets").order("desc").take(ACTIVITY_SOURCE_LIMIT),
    ]);

    const userSignupActivity = recentUsers
      .filter((u) =>
        isWithinRange(u._creationTime, startTimestamp, endTimestamp),
      )
      .map((u) => ({
        type: "user_signup",
        timestamp: u._creationTime,
        data: {
          userId: u._id,
          email: u.email,
          name: u.name,
        },
      }));

    const ticketActivity = recentTickets
      .filter((t) =>
        isWithinRange(t._creationTime, startTimestamp, endTimestamp),
      )
      .map((t) => ({
        type: "ticket_created",
        timestamp: t._creationTime,
        data: {
          ticketId: t._id,
          projectId: t.projectId,
          status: t.status,
          title: t.title,
        },
      }));

    const allActivity = [...userSignupActivity, ...ticketActivity]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_ACTIVITY_ITEMS);

    return allActivity;
  },
});
