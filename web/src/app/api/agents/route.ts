import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { sql, eq, and, gte } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { logger } from '@/util/logger'

export async function GET() {
  try {
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
        },
      })
      .from(schema.agentConfig)
      .innerJoin(
        schema.publisher,
        sql`${schema.agentConfig.publisher_id} = ${schema.publisher.id}`
      )
      .orderBy(sql`${schema.agentConfig.created_at} DESC`)

    // Get all-time usage metrics for published agents only (those with publisher_id and agent_name)
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
      .groupBy(
        schema.agentRun.publisher_id,
        schema.agentRun.agent_name
      )

    // Get weekly usage metrics for published agents only
    const weeklyMetrics = await db
      .select({
        publisher_id: schema.agentRun.publisher_id,
        agent_name: schema.agentRun.agent_name,
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
      .groupBy(
        schema.agentRun.publisher_id,
        schema.agentRun.agent_name
      )

    // Create weekly metrics map by publisher/agent_name
    const weeklyMap = new Map()
    weeklyMetrics.forEach((metric) => {
      if (metric.publisher_id && metric.agent_name) {
        const key = `${metric.publisher_id}/${metric.agent_name}`
        weeklyMap.set(key, Number(metric.weekly_dollars))
      }
    })

    // Create a map of usage metrics by publisher/agent_name
    const metricsMap = new Map()
    usageMetrics.forEach((metric) => {
      if (metric.publisher_id && metric.agent_name) {
        const key = `${metric.publisher_id}/${metric.agent_name}`
        metricsMap.set(key, {
          weekly_dollars: weeklyMap.get(key) || 0,
          total_dollars: Number(metric.total_dollars),
          total_invocations: Number(metric.total_invocations),
          avg_cost_per_run: Number(metric.avg_cost_per_run),
          unique_users: Number(metric.unique_users),
          last_used: metric.last_used,
        })
      }
    })

    // Transform the data to include parsed agent data and real usage metrics
    const transformedAgents = agents.map((agent) => {
      const agentData =
        typeof agent.data === 'string' ? JSON.parse(agent.data) : agent.data
      const agentName = agentData.name || agent.id

      const agentKey = `${agent.publisher.id}/${agentName}`
      const metrics = metricsMap.get(agentKey) || {
        weekly_dollars: 0,
        total_dollars: 0,
        total_invocations: 0,
        avg_cost_per_run: 0,
        unique_users: 0,
        last_used: null,
      }

      return {
        id: agent.id,
        name: agentName,
        description: agentData.description,
        publisher: agent.publisher,
        created_at: agent.created_at,
        usage_count: metrics.total_invocations,
        weekly_spent: metrics.weekly_dollars,
        total_spent: metrics.total_dollars,
        avg_cost_per_invocation: metrics.avg_cost_per_run,
        unique_users: metrics.unique_users,
        last_used: metrics.last_used,
        tags: agentData.tags || [],
      }
    })

    // Group by agent name and keep only the latest version of each (without version in output)
    const latestAgents = new Map()
    transformedAgents.forEach((agent) => {
      const key = `${agent.publisher.id}/${agent.name}`
      if (!latestAgents.has(key)) {
        latestAgents.set(key, agent)
      }
    })

    const result = Array.from(latestAgents.values())

    // Sort by weekly usage (most prominent metric)
    result.sort((a, b) => (b.weekly_spent || 0) - (a.weekly_spent || 0))

    return NextResponse.json(result)
  } catch (error) {
    logger.error({ error }, 'Error fetching agents')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
