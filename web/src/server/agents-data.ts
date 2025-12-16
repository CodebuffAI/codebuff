import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { unstable_cache } from 'next/cache'
import { sql, eq, and, gte } from 'drizzle-orm'
import { buildAgentsData, buildAgentsDataLite } from './agents-transform'

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

export const fetchAgentsWithMetrics = async (): Promise<AgentData[]> => {
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
      eq(schema.agentConfig.publisher_id, schema.publisher.id),
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
        sql`${schema.agentRun.agent_name} IS NOT NULL`,
      ),
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
        sql`${schema.agentRun.agent_name} IS NOT NULL`,
      ),
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
        sql`${schema.agentRun.agent_version} IS NOT NULL`,
      ),
    )
    .groupBy(
      schema.agentRun.publisher_id,
      schema.agentRun.agent_name,
      schema.agentRun.agent_version,
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
        sql`${schema.agentRun.agent_version} IS NOT NULL`,
      ),
    )
    .groupBy(
      schema.agentRun.publisher_id,
      schema.agentRun.agent_name,
      schema.agentRun.agent_version,
    )

  return buildAgentsData({
    agents,
    usageMetrics,
    weeklyMetrics,
    perVersionMetrics,
    perVersionWeeklyMetrics,
  })
}

export const fetchAgentsWithMetricsLite = async (): Promise<AgentData[]> => {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const agentsPromise = db
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
      eq(schema.agentConfig.publisher_id, schema.publisher.id),
    )
    .orderBy(sql`${schema.agentConfig.created_at} DESC`)

  const usageMetricsPromise = db
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

  const weeklyMetricsPromise = db
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

  const [agents, usageMetrics, weeklyMetrics] = await Promise.all([
    agentsPromise,
    usageMetricsPromise,
    weeklyMetricsPromise,
  ])

  return buildAgentsDataLite({
    agents,
    usageMetrics,
    weeklyMetrics,
  })
}

export const getCachedAgents = unstable_cache(
  fetchAgentsWithMetrics,
  ['agents-data'],
  {
    revalidate: 600, // 10 minutes
    tags: ['agents', 'api', 'store'],
  },
)

export const getCachedAgentsLite = unstable_cache(
  fetchAgentsWithMetricsLite,
  ['agents-data-lite'],
  {
    revalidate: 600, // 10 minutes
    tags: ['agents', 'store'],
  },
)
