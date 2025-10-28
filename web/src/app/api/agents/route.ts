import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { sql, eq, and, gte } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'

import { logger } from '@/util/logger'

// ISR Configuration for API route
export const revalidate = 600 // Cache for 10 minutes
export const dynamic = 'force-static'

// Cached function for expensive agent aggregations
const getCachedAgents = unstable_cache(
  async () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // Get all published agents with their publisher info
    const agents = await db
      .select({
        id: schema.agentConfig.id,
        version: schema.agentConfig.version,
        data: schema.agentConfig.data,
        created_at: schema.agentConfig.created_at,
        publisher: {
          id: schema.publisher.id,
          name: schema.publisher.name,
          verified: schema.publisher.verified,
          avatar_url: schema.publisher.avatar_url,
        },
      })
      .from(schema.agentConfig)
      .innerJoin(
        schema.publisher,
        sql`${schema.agentConfig.publisher_id} = ${schema.publisher.id}`
      )
      .orderBy(sql`${schema.agentConfig.created_at} DESC`)

    // Get aggregated all-time usage metrics across all versions
    const usageMetrics = await db
      .select({
        publisher_id: schema.agentRun.publisher_id,
        agent_name: schema.agentRun.agent_name,
        total_invocations: sql<number>`COUNT(*)`,
        total_dollars: sql<number>`COALESCE(SUM(${schema.agentRun.total_credits}) / 100.0, 0)`,
        avg_cost_per_run: sql<number>`COALESCE(AVG(${schema.agentRun.total_credits}) / 100.0, 0)`,
        unique_users: sql<number>`COUNT(DISTINCT ${schema.agentRun.user_id})`,
        last_used: sql<Date>`MAX(${schema.agentRun.created_at})`,
      })
      .from(schema.agentRun)
      .where(
        and(
          eq(schema.agentRun.status, 'completed'),
          sql`${schema.agentRun.agent_id} != 'test-agent'`,
          sql`${schema.agentRun.publisher_id} IS NOT NULL`,
          sql`${schema.agentRun.agent_name} IS NOT NULL`
        )
      )
      .groupBy(schema.agentRun.publisher_id, schema.agentRun.agent_name)

    // Get aggregated weekly usage metrics across all versions
    const weeklyMetrics = await db
      .select({
        publisher_id: schema.agentRun.publisher_id,
        agent_name: schema.agentRun.agent_name,
        weekly_runs: sql<number>`COUNT(*)`,
        weekly_dollars: sql<number>`COALESCE(SUM(${schema.agentRun.total_credits}) / 100.0, 0)`,
      })
      .from(schema.agentRun)
      .where(
        and(
          eq(schema.agentRun.status, 'completed'),
          gte(schema.agentRun.created_at, oneWeekAgo),
          sql`${schema.agentRun.agent_id} != 'test-agent'`,
          sql`${schema.agentRun.publisher_id} IS NOT NULL`,
          sql`${schema.agentRun.agent_name} IS NOT NULL`
        )
      )
      .groupBy(schema.agentRun.publisher_id, schema.agentRun.agent_name)

    // Get per-version usage metrics for all-time
    const perVersionMetrics = await db
      .select({
        publisher_id: schema.agentRun.publisher_id,
        agent_name: schema.agentRun.agent_name,
        agent_version: schema.agentRun.agent_version,
        total_invocations: sql<number>`COUNT(*)`,
        total_dollars: sql<number>`COALESCE(SUM(${schema.agentRun.total_credits}) / 100.0, 0)`,
        avg_cost_per_run: sql<number>`COALESCE(AVG(${schema.agentRun.total_credits}) / 100.0, 0)`,
        unique_users: sql<number>`COUNT(DISTINCT ${schema.agentRun.user_id})`,
        last_used: sql<Date>`MAX(${schema.agentRun.created_at})`,
      })
      .from(schema.agentRun)
      .where(
        and(
          eq(schema.agentRun.status, 'completed'),
          sql`${schema.agentRun.agent_id} != 'test-agent'`,
          sql`${schema.agentRun.publisher_id} IS NOT NULL`,
          sql`${schema.agentRun.agent_name} IS NOT NULL`,
          sql`${schema.agentRun.agent_version} IS NOT NULL`
        )
      )
      .groupBy(
        schema.agentRun.publisher_id,
        schema.agentRun.agent_name,
        schema.agentRun.agent_version
      )

    // Get per-version weekly usage metrics
    const perVersionWeeklyMetrics = await db
      .select({
        publisher_id: schema.agentRun.publisher_id,
        agent_name: schema.agentRun.agent_name,
        agent_version: schema.agentRun.agent_version,
        weekly_runs: sql<number>`COUNT(*)`,
        weekly_dollars: sql<number>`COALESCE(SUM(${schema.agentRun.total_credits}) / 100.0, 0)`,
      })
      .from(schema.agentRun)
      .where(
        and(
          eq(schema.agentRun.status, 'completed'),
          gte(schema.agentRun.created_at, oneWeekAgo),
          sql`${schema.agentRun.agent_id} != 'test-agent'`,
          sql`${schema.agentRun.publisher_id} IS NOT NULL`,
          sql`${schema.agentRun.agent_name} IS NOT NULL`,
          sql`${schema.agentRun.agent_version} IS NOT NULL`
        )
      )
      .groupBy(
        schema.agentRun.publisher_id,
        schema.agentRun.agent_name,
        schema.agentRun.agent_version
      )

    // Create weekly metrics map by publisher/agent_name
    const weeklyMap = new Map()
    weeklyMetrics.forEach((metric) => {
      if (metric.publisher_id && metric.agent_name) {
        const key = `${metric.publisher_id}/${metric.agent_name}`
        weeklyMap.set(key, {
          weekly_runs: Number(metric.weekly_runs),
          weekly_dollars: Number(metric.weekly_dollars),
        })
      }
    })

    // Create a map of aggregated usage metrics by publisher/agent_name
    const metricsMap = new Map()
    usageMetrics.forEach((metric) => {
      if (metric.publisher_id && metric.agent_name) {
        const key = `${metric.publisher_id}/${metric.agent_name}`
        const weeklyData = weeklyMap.get(key) || {
          weekly_runs: 0,
          weekly_dollars: 0,
        }
        metricsMap.set(key, {
          weekly_runs: weeklyData.weekly_runs,
          weekly_dollars: weeklyData.weekly_dollars,
          total_dollars: Number(metric.total_dollars),
          total_invocations: Number(metric.total_invocations),
          avg_cost_per_run: Number(metric.avg_cost_per_run),
          unique_users: Number(metric.unique_users),
          last_used: metric.last_used,
        })
      }
    })

    // Create per-version weekly metrics map
    const perVersionWeeklyMap = new Map()
    perVersionWeeklyMetrics.forEach((metric) => {
      if (metric.publisher_id && metric.agent_name && metric.agent_version) {
        const key = `${metric.publisher_id}/${metric.agent_name}@${metric.agent_version}`
        perVersionWeeklyMap.set(key, {
          weekly_runs: Number(metric.weekly_runs),
          weekly_dollars: Number(metric.weekly_dollars),
        })
      }
    })

    // Create per-version metrics map
    const perVersionMetricsMap = new Map()
    perVersionMetrics.forEach((metric) => {
      if (metric.publisher_id && metric.agent_name && metric.agent_version) {
        const key = `${metric.publisher_id}/${metric.agent_name}@${metric.agent_version}`
        const weeklyData = perVersionWeeklyMap.get(key) || {
          weekly_runs: 0,
          weekly_dollars: 0,
        }
        perVersionMetricsMap.set(key, {
          weekly_runs: weeklyData.weekly_runs,
          weekly_dollars: weeklyData.weekly_dollars,
          total_dollars: Number(metric.total_dollars),
          total_invocations: Number(metric.total_invocations),
          avg_cost_per_run: Number(metric.avg_cost_per_run),
          unique_users: Number(metric.unique_users),
          last_used: metric.last_used,
        })
      }
    })

    // Group per-version metrics by agent
    const versionMetricsByAgent = new Map()
    perVersionMetricsMap.forEach((metrics, key) => {
      const [publisherAgentKey, version] = key.split('@')
      if (!versionMetricsByAgent.has(publisherAgentKey)) {
        versionMetricsByAgent.set(publisherAgentKey, {})
      }
      versionMetricsByAgent.get(publisherAgentKey)[version] = metrics
    })

    // First, group agents by publisher/name to get the latest version of each
    const latestAgents = new Map()
    agents.forEach((agent) => {
      const agentData =
        typeof agent.data === 'string' ? JSON.parse(agent.data) : agent.data
      const agentName = agentData.name || agent.id
      const key = `${agent.publisher.id}/${agentName}`

      if (!latestAgents.has(key)) {
        latestAgents.set(key, {
          agent,
          agentData,
          agentName,
        })
      }
    })

    // Transform the latest agents with their aggregated metrics
    const result = Array.from(latestAgents.values()).map(
      ({ agent, agentData, agentName }) => {
        const agentKey = `${agent.publisher.id}/${agentName}`
        const metrics = metricsMap.get(agentKey) || {
          weekly_runs: 0,
          weekly_dollars: 0,
          total_dollars: 0,
          total_invocations: 0,
          avg_cost_per_run: 0,
          unique_users: 0,
          last_used: null,
        }

        // Use agent.id (config ID) to get version stats since that's what the runs table uses as agent_name
        const versionStatsKey = `${agent.publisher.id}/${agent.id}`
        const version_stats = versionMetricsByAgent.get(versionStatsKey) || {}

        return {
          id: agent.id,
          name: agentName,
          description: agentData.description,
          publisher: agent.publisher,
          version: agent.version,
          created_at: agent.created_at,
          // Aggregated stats across all versions (for agent store)
          usage_count: metrics.total_invocations,
          weekly_runs: metrics.weekly_runs,
          weekly_spent: metrics.weekly_dollars,
          total_spent: metrics.total_dollars,
          avg_cost_per_invocation: metrics.avg_cost_per_run,
          unique_users: metrics.unique_users,
          last_used: metrics.last_used,
          // Per-version stats for agent detail pages
          version_stats,
          tags: agentData.tags || [],
        }
      }
    )

    // Sort by weekly usage (most prominent metric)
    result.sort((a, b) => (b.weekly_spent || 0) - (a.weekly_spent || 0))

    return result
  },
  ['agents-data'],
  {
    revalidate: 600, // 10 minutes
    tags: ['agents', 'api'],
  }
)

export async function GET() {
  try {
    const result = await getCachedAgents()

    const response = NextResponse.json(result)

    // Add optimized cache headers for better performance
    response.headers.set(
      'Cache-Control',
      'public, max-age=300, s-maxage=600, stale-while-revalidate=3600'
    )

    // Add compression and optimization headers
    response.headers.set('Vary', 'Accept-Encoding')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Content-Type', 'application/json; charset=utf-8')

    return response
  } catch (error) {
    logger.error({ error }, 'Error fetching agents')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
