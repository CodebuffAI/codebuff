import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { logger } from '@/util/logger'

export async function GET() {
  try {
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
      .orderBy(sql`${schema.agentConfig.created_at} DESC`) // Sort by date descending
      .limit(100) // Limit for performance

    // Transform the data to include parsed agent data and mock usage metrics
    const transformedAgents = agents.map((agent) => {
      const agentData = typeof agent.data === 'string' ? JSON.parse(agent.data) : agent.data
      
      // Mock usage metrics (in a real app, these would come from analytics/usage tables)
      const mockUsageCount = Math.floor(Math.random() * 50000) + 1000
      const mockTotalSpent = Math.floor(Math.random() * 5000) + 100 // $100-$5100
      const mockAvgCostPerInvocation = mockTotalSpent / mockUsageCount
      const mockResponseTime = Math.floor(Math.random() * 3000) + 500 // 500-3500ms
      
      return {
        id: agent.id,
        name: agentData.name || agent.id,
        description: agentData.description,
        publisher: agent.publisher,
        version: agent.version,
        created_at: agent.created_at,
        usage_count: mockUsageCount,
        total_spent: mockTotalSpent,
        avg_cost_per_invocation: mockAvgCostPerInvocation,
        avg_response_time: mockResponseTime,

        tags: agentData.tags || [],
      }
    })

    // Group by agent name and keep only the latest version of each
    const latestAgents = new Map()
    transformedAgents.forEach((agent) => {
      const key = `${agent.publisher.id}/${agent.name}`
      if (!latestAgents.has(key)) { // Since it's sorted, the first one is the latest
        latestAgents.set(key, agent)
      }
    })

    const result = Array.from(latestAgents.values())

    return NextResponse.json(result)
  } catch (error) {
    logger.error({ error }, 'Error fetching agents')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}