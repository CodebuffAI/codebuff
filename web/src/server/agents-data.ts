import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { unstable_cache } from 'next/cache'
import { sql, eq, and, gte } from 'drizzle-orm'

export interface AgentData {
  id: string
  name: string
  description?: string
  publisher: {
    id: string
    name: string
    verified: boolean
    avatar_url?: string | null
  }
  version: string
  created_at: string
  usage_count?: number
  weekly_runs?: number
  weekly_spent?: number
  total_spent?: number
  avg_cost_per_invocation?: number
  unique_users?: number
  last_used?: string
  version_stats?: Record<string, any>
  tags?: string[]
}

const fetchAgentsWithMetrics = async (): Promise<AgentData[]> => {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

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
      sql`${schema.agentConfig.publisher_id} = ${schema.publisher.id}`,
    )
    .orderBy(sql`${schema.agentConfig.created_at} DESC`)

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
        sql`${schema.agentRun.agent_name} IS NOT NULL`,
      ),
    )
    .groupBy(schema.agentRun.publisher_id, schema.agentRun.agent_name)

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
        sql`${schema.agentRun.agent_name} IS NOT NULL`,
      ),
    )
    .groupBy(schema.agentRun.publisher_id, schema.agentRun.agent_name)

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
        sql`${schema.agentRun.agent_version} IS NOT NULL`,
      ),
    )
    .groupBy(
      schema.agentRun.publisher_id,
      schema.agentRun.agent_name,
      schema.agentRun.agent_version,
    )

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
        sql`${schema.agentRun.agent_version} IS NOT NULL`,
      ),
    )
    .groupBy(
      schema.agentRun.publisher_id,
      schema.agentRun.agent_name,
      schema.agentRun.agent_version,
    )

  const weeklyMap = new Map<string, { weekly_runs: number; weekly_dollars: number }>()
  weeklyMetrics.forEach((metric) => {
    if (metric.publisher_id && metric.agent_name) {
      const key = `${metric.publisher_id}/${metric.agent_name}`
      weeklyMap.set(key, {
        weekly_runs: Number(metric.weekly_runs),
        weekly_dollars: Number(metric.weekly_dollars),
      })
    }
  })

  const metricsMap = new Map<
    string,
    {
      weekly_runs: number
      weekly_dollars: number
      total_dollars: number
      total_invocations: number
      avg_cost_per_run: number
      unique_users: number
      last_used: Date | null
    }
  >()
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
        last_used: metric.last_used ?? null,
      })
    }
  })

  const perVersionWeeklyMap = new Map<
    string,
    { weekly_runs: number; weekly_dollars: number }
  >()
  perVersionWeeklyMetrics.forEach((metric) => {
    if (metric.publisher_id && metric.agent_name && metric.agent_version) {
      const key = `${metric.publisher_id}/${metric.agent_name}@${metric.agent_version}`
      perVersionWeeklyMap.set(key, {
        weekly_runs: Number(metric.weekly_runs),
        weekly_dollars: Number(metric.weekly_dollars),
      })
    }
  })

  const perVersionMetricsMap = new Map<string, Record<string, any>>()
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
        last_used: metric.last_used ? metric.last_used.toISOString() : null,
      })
    }
  })

  const versionMetricsByAgent = new Map<string, Record<string, any>>()
  perVersionMetricsMap.forEach((metrics, key) => {
    const [publisherAgentKey, version] = key.split('@')
    if (!versionMetricsByAgent.has(publisherAgentKey)) {
      versionMetricsByAgent.set(publisherAgentKey, {})
    }
    versionMetricsByAgent.get(publisherAgentKey)![version] = metrics
  })

  const latestAgents = new Map<
    string,
    {
      agent: (typeof agents)[number]
      agentData: any
      agentName: string
    }
  >()
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

      const versionStatsKey = `${agent.publisher.id}/${agent.id}`
      const rawVersionStats = versionMetricsByAgent.get(versionStatsKey) || {}
      const version_stats = Object.fromEntries(
        Object.entries(rawVersionStats).map(([version, stats]) => [
          version,
          {
            ...stats,
            last_used: stats?.last_used ?? undefined,
          },
        ]),
      )

      return {
        id: agent.id,
        name: agentName,
        description: agentData.description,
        publisher: agent.publisher,
        version: agent.version,
        created_at:
          agent.created_at instanceof Date
            ? agent.created_at.toISOString()
            : agent.created_at,
        usage_count: metrics.total_invocations,
        weekly_runs: metrics.weekly_runs,
        weekly_spent: metrics.weekly_dollars,
        total_spent: metrics.total_dollars,
        avg_cost_per_invocation: metrics.avg_cost_per_run,
        unique_users: metrics.unique_users,
        last_used: metrics.last_used
          ? metrics.last_used.toISOString()
          : undefined,
        version_stats,
        tags: agentData.tags || [],
      }
    },
  )

  result.sort((a, b) => (b.weekly_spent || 0) - (a.weekly_spent || 0))

  return result
}

export const getCachedAgents = unstable_cache(fetchAgentsWithMetrics, ['agents-data'], {
  revalidate: 600,
  tags: ['agents', 'api', 'store'],
})
