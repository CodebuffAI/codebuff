import { internalMutation, query } from './_generated/server'
import { v } from 'convex/values'
import { getAuthUser } from './users'

const DAILY_RUN_SPIKE_THRESHOLD = 20
const DAILY_METERED_CREDIT_SPIKE_THRESHOLD = 5_000
const DAILY_ERROR_SPIKE_THRESHOLD = 5

export const bumpUserAgentInvocation = internalMutation({
  args: {
    userId: v.id('users'),
    source: v.optional(v.union(v.literal('v2'), v.literal('cli'))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('user_platform_usage_stats')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique()
    const now = Date.now()
    const src = args.source ?? 'v2'
    if (existing) {
      await ctx.db.patch(existing._id, {
        agentInvocations: existing.agentInvocations + 1,
        lastInvocationAt: now,
        ...(src === 'v2' && { v2Runs: (existing.v2Runs ?? 0) + 1 }),
        ...(src === 'cli' && { cliRuns: (existing.cliRuns ?? 0) + 1 }),
      })
    } else {
      await ctx.db.insert('user_platform_usage_stats', {
        userId: args.userId,
        agentInvocations: 1,
        lastInvocationAt: now,
        v2Runs: src === 'v2' ? 1 : 0,
        cliRuns: src === 'cli' ? 1 : 0,
      })
    }
  },
})

export const getAdminUsageData = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx)
    if (!user || (user.role !== 'god' && user.role !== 'admin')) return null

    const top10 = await ctx.db
      .query('user_platform_usage_stats')
      .withIndex('by_invocations')
      .order('desc')
      .take(10)

    const users = []
    for (const stat of top10) {
      const u = await ctx.db.get(stat.userId)
      users.push({
        userId: stat.userId as string,
        email: u?.email ?? '(unknown)',
        name: u?.name ?? '(unknown)',
        v2Runs: stat.v2Runs ?? 0,
        cliRuns: stat.cliRuns ?? 0,
        totalRuns: stat.agentInvocations,
        lastRunAt: stat.lastInvocationAt,
      })
    }

    const todayStr = new Date().toISOString().slice(0, 10)
    const modelRows = await ctx.db.query('model_usage_stats').collect()
    const models = modelRows.map((s) => ({
      agentType: s.agentType,
      model: s.model,
      total: s.total,
      recent: s.recentDayDate === todayStr ? s.recentDay : 0,
    }))

    const todayUsage = await ctx.db
      .query('freebuff_daily_usage')
      .withIndex('by_day_metered_credits', (q) => q.eq('day', todayStr))
      .order('desc')
      .take(50)
    const freebuffUsers = []
    for (const usage of todayUsage) {
      const usageUser = await ctx.db.get(usage.user_id)
      freebuffUsers.push({
        userId: usage.user_id as string,
        email: usageUser?.email ?? '(unknown)',
        name: usageUser?.name ?? '(unknown)',
        runCount: usage.run_count,
        meteredCredits: usage.metered_credits,
        errorCount: usage.error_count,
        timedOutCount: usage.timed_out_count,
        lastRunAt: usage.last_run_at,
        spikeDetected:
          usage.run_count >= DAILY_RUN_SPIKE_THRESHOLD ||
          usage.metered_credits >= DAILY_METERED_CREDIT_SPIKE_THRESHOLD ||
          usage.error_count + usage.timed_out_count >=
            DAILY_ERROR_SPIKE_THRESHOLD,
      })
    }

    return { users, models, freebuffUsers }
  },
})

export const getFreebuffUserUsage = query({
  args: {
    userId: v.id('users'),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await getAuthUser(ctx)
    if (!admin || (admin.role !== 'god' && admin.role !== 'admin')) return null

    const days = Math.min(Math.max(Math.floor(args.days ?? 30), 1), 90)
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const rows = await ctx.db
      .query('freebuff_daily_usage')
      .withIndex('by_user_day', (q) =>
        q.eq('user_id', args.userId).gte('day', start),
      )
      .collect()

    return {
      days: rows.sort((a, b) => a.day.localeCompare(b.day)),
      totals: rows.reduce(
        (totals, row) => ({
          runs: totals.runs + row.run_count,
          meteredCredits: totals.meteredCredits + row.metered_credits,
          errors: totals.errors + row.error_count,
          timedOut: totals.timedOut + row.timed_out_count,
        }),
        { runs: 0, meteredCredits: 0, errors: 0, timedOut: 0 },
      ),
    }
  },
})
