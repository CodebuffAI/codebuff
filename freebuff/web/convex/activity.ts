import { v } from 'convex/values'
import { internalMutation, query } from './_generated/server'
import { getAuthUser } from './users'
import {
  activeUsersByDay,
  allProjects,
  allUsers,
  cloudActiveUsersByDay,
  cloudProjectsByTypeDay,
  getDayKeyForDaysAgo,
  getTodayKey,
  projectsByDay,
  userActivityByTime,
  usersByDay,
} from './aggregates/admin_aggregates'

const HOUR_MS = 60 * 60 * 1000

/** Day-bucketed prefix for connected_repo projects in cloudProjectsByTypeDay. */
const CLOUD_PROJECT_TYPE = 'connected_repo'

/**
 * Record that a user sent a message. Scheduled (runAfter 0) from the Freebuff
 * send mutation so a metrics failure can never break a send, and so the
 * table writes + aggregate writes commit atomically in their own transaction.
 *
 * Writes are O(1): one point-indexed read + patch/insert per table, plus the
 * corresponding aggregate node updates. No scans.
 */
export const recordActivity = internalMutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    // 1) Per-user "last active" row, counted by userActivityByTime for the
    //    live-users metric.
    const existing = await ctx.db
      .query('user_activity')
      .withIndex('by_user', (q) => q.eq('user_id', args.userId))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, { last_active_at: now })
      const updated = await ctx.db.get(existing._id)
      if (updated) {
        await userActivityByTime.replace(ctx, existing, updated)
      }
    } else {
      const id = await ctx.db.insert('user_activity', {
        user_id: args.userId,
        last_active_at: now,
      })
      const inserted = await ctx.db.get(id)
      if (inserted) {
        await userActivityByTime.insert(ctx, inserted)
      }
    }

    // 2) Per-(user, day) row, counted by activeUsersByDay for DAU. Inserted
    //    only on the user's first message of the UTC day.
    const todayKey = getTodayKey()
    const dailyExisting = await ctx.db
      .query('user_activity_daily')
      .withIndex('by_user_and_day', (q) =>
        q.eq('user_id', args.userId).eq('day', todayKey),
      )
      .unique()

    if (!dailyExisting) {
      const dailyId = await ctx.db.insert('user_activity_daily', {
        user_id: args.userId,
        day: todayKey,
      })
      const dailyInserted = await ctx.db.get(dailyId)
      if (dailyInserted) {
        await activeUsersByDay.insert(ctx, dailyInserted)
      }
    }
  },
})

/**
 * Record that a user was active on Freebuff Cloud (i.e. sent a message in a
 * connected_repo project). Scheduled (runAfter 0) from the send mutation, only
 * for Cloud projects, so a metrics failure can never break a send.
 *
 * O(1): one point-indexed read + (on the user's first Cloud message of the UTC
 * day) one insert + aggregate node update. No scans. Counted via
 * cloudActiveUsersByDay for Freebuff Cloud DAU.
 */
export const recordCloudActivity = internalMutation({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const todayKey = getTodayKey()
    const existing = await ctx.db
      .query('cloud_user_activity_daily')
      .withIndex('by_user_and_day', (q) =>
        q.eq('user_id', args.userId).eq('day', todayKey),
      )
      .unique()

    if (!existing) {
      const id = await ctx.db.insert('cloud_user_activity_daily', {
        user_id: args.userId,
        day: todayKey,
      })
      const inserted = await ctx.db.get(id)
      if (inserted) {
        await cloudActiveUsersByDay.insert(ctx, inserted)
      }
    }
  },
})

/**
 * Snapshot yesterday's metrics into the durable daily_stats table. Runs from
 * a cron shortly after UTC midnight. Idempotent: re-running updates the same
 * day's row. All counts come from aggregates — no table scans.
 */
export const snapshotDailyStats = internalMutation({
  args: {
    // Optional override (YYYY-MM-DD) for backfills/repairs.
    day: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const day = args.day ?? getDayKeyForDaysAgo(1)

    const [activeUsers, newUsers, newProjects, totalUsers, totalProjects] =
      await Promise.all([
        activeUsersByDay.count(ctx, { bounds: { prefix: [day] } }),
        usersByDay.count(ctx, { bounds: { prefix: [day] } }),
        projectsByDay.count(ctx, { bounds: { prefix: [day] } }),
        allUsers.count(ctx, { bounds: {} }),
        allProjects.count(ctx, { bounds: {} }),
      ])

    const existing = await ctx.db
      .query('daily_stats')
      .withIndex('by_day', (q) => q.eq('day', day))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        active_users: activeUsers,
        new_users: newUsers,
        new_projects: newProjects,
        total_users: totalUsers,
        total_projects: totalProjects,
      })
    } else {
      await ctx.db.insert('daily_stats', {
        day,
        active_users: activeUsers,
        new_users: newUsers,
        new_projects: newProjects,
        total_users: totalUsers,
        total_projects: totalProjects,
        created_at: Date.now(),
      })
    }

    console.log(
      `[activity.snapshotDailyStats] ${day}: active=${activeUsers} newUsers=${newUsers} newProjects=${newProjects} totalUsers=${totalUsers} totalProjects=${totalProjects}`,
    )

    // Freebuff Cloud (connected_repo) snapshot — same day, aggregate-only.
    const [cloudActiveUsers, cloudNewProjects, cloudTotalProjects] =
      await Promise.all([
        cloudActiveUsersByDay.count(ctx, { bounds: { prefix: [day] } }),
        cloudProjectsByTypeDay.count(ctx, {
          bounds: { prefix: [CLOUD_PROJECT_TYPE, day] },
        }),
        cloudProjectsByTypeDay.count(ctx, {
          bounds: { prefix: [CLOUD_PROJECT_TYPE] },
        }),
      ])

    const existingCloud = await ctx.db
      .query('cloud_daily_stats')
      .withIndex('by_day', (q) => q.eq('day', day))
      .unique()

    if (existingCloud) {
      await ctx.db.patch(existingCloud._id, {
        active_users: cloudActiveUsers,
        new_projects: cloudNewProjects,
        total_projects: cloudTotalProjects,
      })
    } else {
      await ctx.db.insert('cloud_daily_stats', {
        day,
        active_users: cloudActiveUsers,
        new_projects: cloudNewProjects,
        total_projects: cloudTotalProjects,
        created_at: Date.now(),
      })
    }

    console.log(
      `[activity.snapshotDailyStats] cloud ${day}: active=${cloudActiveUsers} newProjects=${cloudNewProjects} totalProjects=${cloudTotalProjects}`,
    )
  },
})

/**
 * Admin-only engagement metrics. Every count is an aggregate lookup
 * (O(log n)); the only table read is a bounded take on daily_stats history.
 *
 * `refreshKey` exists so the client can poll: Convex queries don't re-run as
 * wall-clock time passes, so the client bumps refreshKey every minute to
 * advance the "past hour" window.
 */
export const getEngagementStats = query({
  args: {
    refreshKey: v.optional(v.number()),
    historyDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user || (user.role !== 'god' && user.role !== 'admin')) {
      return null
    }

    const now = Date.now()
    const todayKey = getTodayKey()
    const historyDays = Math.min(Math.max(args.historyDays ?? 30, 1), 90)

    const [
      liveUsers,
      activeToday,
      newUsersToday,
      newProjectsToday,
      totalUsers,
      totalProjects,
    ] = await Promise.all([
      // Unique users whose most recent message send is within the past hour.
      userActivityByTime.count(ctx, {
        bounds: { lower: { key: [now - HOUR_MS], inclusive: true } },
      }),
      activeUsersByDay.count(ctx, { bounds: { prefix: [todayKey] } }),
      usersByDay.count(ctx, { bounds: { prefix: [todayKey] } }),
      projectsByDay.count(ctx, { bounds: { prefix: [todayKey] } }),
      allUsers.count(ctx, { bounds: {} }),
      allProjects.count(ctx, { bounds: {} }),
    ])

    // Persisted history (one small row per day, newest first).
    const history = await ctx.db
      .query('daily_stats')
      .withIndex('by_day')
      .order('desc')
      .take(historyDays)

    return {
      asOf: now,
      live: {
        usersPastHour: liveUsers,
      },
      today: {
        day: todayKey,
        activeUsers: activeToday,
        newUsers: newUsersToday,
        newProjects: newProjectsToday,
      },
      totals: {
        users: totalUsers,
        projects: totalProjects,
      },
      history: history.map((row) => ({
        day: row.day,
        activeUsers: row.active_users,
        newUsers: row.new_users,
        newProjects: row.new_projects,
        totalUsers: row.total_users,
        totalProjects: row.total_projects,
      })),
    }
  },
})

/**
 * Admin-only Freebuff Cloud engagement metrics. Mirrors getEngagementStats but
 * scoped to connected_repo (Cloud) usage. Every count is an aggregate lookup
 * (O(log n)); the only table read is a bounded take on cloud_daily_stats.
 *
 * Today's row isn't snapshotted until the nightly cron, so today's numbers are
 * computed live from the aggregates and merged on top of the history.
 */
export const getCloudEngagementStats = query({
  args: {
    refreshKey: v.optional(v.number()),
    historyDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user || (user.role !== 'god' && user.role !== 'admin')) {
      return null
    }

    const now = Date.now()
    const todayKey = getTodayKey()
    const historyDays = Math.min(Math.max(args.historyDays ?? 30, 1), 90)

    const [activeToday, newProjectsToday, totalProjects] = await Promise.all([
      cloudActiveUsersByDay.count(ctx, { bounds: { prefix: [todayKey] } }),
      cloudProjectsByTypeDay.count(ctx, {
        bounds: { prefix: [CLOUD_PROJECT_TYPE, todayKey] },
      }),
      cloudProjectsByTypeDay.count(ctx, {
        bounds: { prefix: [CLOUD_PROJECT_TYPE] },
      }),
    ])

    const history = await ctx.db
      .query('cloud_daily_stats')
      .withIndex('by_day')
      .order('desc')
      .take(historyDays)

    return {
      asOf: now,
      today: {
        day: todayKey,
        activeUsers: activeToday,
        newProjects: newProjectsToday,
      },
      totals: {
        projects: totalProjects,
      },
      history: history.map((row) => ({
        day: row.day,
        activeUsers: row.active_users,
        newProjects: row.new_projects,
        totalProjects: row.total_projects,
      })),
    }
  },
})
