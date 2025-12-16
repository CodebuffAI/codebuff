import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import type { Logger } from '@codebuff/common/types/contracts/logger'

import {
  buildAgentTree,
  type AgentLookupResult,
  type AgentTreeData,
} from '@/lib/agent-tree'

interface RouteParams {
  publisherId: string
  agentId: string
  version: string
}

export interface GetDependenciesParams {
  params: Promise<RouteParams>
  logger: Logger
}

interface PendingLookup {
  resolve: (result: AgentLookupResult | null) => void
  publisher: string
  agentId: string
  version: string
}

/**
 * Creates a batching agent lookup function that automatically batches
 * concurrent requests into a single database query.
 * 
 * This solves the N+1 query problem: when the tree builder processes siblings
 * in parallel with Promise.all, all their lookupAgent calls will be queued
 * and executed in a single batch query.
 * 
 * Query reduction: ~2N queries -> ~maxDepth queries (typically ≤6 total)
 */
function createBatchingAgentLookup(
  publisherSet: Set<string>,
  logger: Logger,
) {
  const cache = new Map<string, AgentLookupResult | null>()
  const pending: PendingLookup[] = []
  let batchScheduled = false

  async function executeBatch() {
    batchScheduled = false
    if (pending.length === 0) return

    // Grab all pending requests and clear the queue
    const batch = [...pending]
    pending.length = 0

    try {
      const uniqueRequests = new Map<
        string,
        { publisherId: string; agentId: string; version: string }
      >()

      for (const req of batch) {
        const cacheKey = `${req.publisher}/${req.agentId}@${req.version}`

        if (!publisherSet.has(req.publisher)) {
          cache.set(cacheKey, null)
          req.resolve(null)
          continue
        }

        uniqueRequests.set(`${req.publisher}:${req.agentId}:${req.version}`, {
          publisherId: req.publisher,
          agentId: req.agentId,
          version: req.version,
        })
      }

      let agents: Array<typeof schema.agentConfig.$inferSelect> = []
      if (uniqueRequests.size > 0) {
        const conditions = [...uniqueRequests.values()].map((req) =>
          and(
            eq(schema.agentConfig.id, req.agentId),
            eq(schema.agentConfig.version, req.version),
            eq(schema.agentConfig.publisher_id, req.publisherId),
          ),
        )
        agents = await db
          .select()
          .from(schema.agentConfig)
          .where(conditions.length === 1 ? conditions[0] : or(...conditions))
      }

      // Create lookup map for quick access
      const agentMap = new Map<string, typeof schema.agentConfig.$inferSelect>()
      for (const agent of agents) {
        agentMap.set(`${agent.publisher_id}:${agent.id}:${agent.version}`, agent)
      }

      // Resolve all pending requests
      for (const req of batch) {
        const cacheKey = `${req.publisher}/${req.agentId}@${req.version}`
        
        // Resolve duplicates from cache
        if (cache.has(cacheKey)) {
          req.resolve(cache.get(cacheKey) ?? null)
          continue
        }

        if (!publisherSet.has(req.publisher)) {
          cache.set(cacheKey, null)
          req.resolve(null)
          continue
        }

        const lookupKey = `${req.publisher}:${req.agentId}:${req.version}`
        const agent = agentMap.get(lookupKey)
        if (!agent) {
          cache.set(cacheKey, null)
          req.resolve(null)
          continue
        }

        const agentData =
          typeof agent.data === 'string' ? JSON.parse(agent.data) : agent.data

        const result: AgentLookupResult = {
          displayName: agentData?.displayName ?? agentData?.name ?? req.agentId,
          spawnerPrompt: agentData?.spawnerPrompt ?? null,
          spawnableAgents: Array.isArray(agentData?.spawnableAgents)
            ? agentData.spawnableAgents
            : [],
          isAvailable: true,
        }

        cache.set(cacheKey, result)
        req.resolve(result)
      }
    } catch (error) {
      logger.error({ error }, 'Batch agent lookup failed')
      for (const req of batch) {
        const cacheKey = `${req.publisher}/${req.agentId}@${req.version}`
        if (!cache.has(cacheKey)) {
          cache.set(cacheKey, null)
        }
        req.resolve(cache.get(cacheKey) ?? null)
      }
    }
  }

  return async function lookupAgent(
    publisher: string,
    agentId: string,
    version: string,
  ): Promise<AgentLookupResult | null> {
    const cacheKey = `${publisher}/${agentId}@${version}`

    // Return from cache if available
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey) ?? null
    }

    // Queue the request and schedule batch execution
    return new Promise((resolve) => {
      pending.push({ resolve, publisher, agentId, version })

      if (!batchScheduled) {
        batchScheduled = true
        // Use setImmediate to batch all concurrent requests in the same tick
        setImmediate(executeBatch)
      }
    })
  }
}

export async function getDependencies({
  params,
  logger,
}: GetDependenciesParams) {
  try {
    const { publisherId, agentId, version } = await params

    if (!publisherId || !agentId || !version) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 },
      )
    }

    // Pre-fetch all publishers once (small table, single query)
    // This eliminates N publisher queries
    const allPublishers = await db.select().from(schema.publisher)
    const publisherSet = new Set(allPublishers.map((p) => p.id))

    // Verify the root publisher exists
    if (!publisherSet.has(publisherId)) {
      return NextResponse.json(
        { error: 'Publisher not found' },
        { status: 404 },
      )
    }

    // Create batching lookup function
    const lookupAgent = createBatchingAgentLookup(publisherSet, logger)

    // Find the root agent
    const rootAgent = await db
      .select()
      .from(schema.agentConfig)
      .where(
        and(
          eq(schema.agentConfig.id, agentId),
          eq(schema.agentConfig.version, version),
          eq(schema.agentConfig.publisher_id, publisherId),
        ),
      )
      .then((rows) => rows[0])

    if (!rootAgent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const rootData =
      typeof rootAgent.data === 'string'
        ? JSON.parse(rootAgent.data)
        : rootAgent.data

    const spawnableAgents: string[] = Array.isArray(rootData.spawnableAgents)
      ? rootData.spawnableAgents
      : []

    if (spawnableAgents.length === 0) {
      const emptyTree: AgentTreeData = {
        root: {
          fullId: `${publisherId}/${agentId}@${version}`,
          agentId,
          publisher: publisherId,
          version,
          displayName: rootData.displayName ?? rootData.name ?? agentId,
          spawnerPrompt: rootData.spawnerPrompt ?? null,
          isAvailable: true,
          children: [],
          isCyclic: false,
        },
        totalAgents: 1,
        maxDepth: 0,
        hasCycles: false,
      }
      return NextResponse.json(emptyTree)
    }

    // Build the dependency tree
    // The batching lookup will automatically batch all concurrent requests
    // from each tree level into single queries
    const tree = await buildAgentTree({
      rootPublisher: publisherId,
      rootAgentId: agentId,
      rootVersion: version,
      rootDisplayName: rootData.displayName ?? rootData.name ?? agentId,
      rootSpawnerPrompt: rootData.spawnerPrompt ?? null,
      rootSpawnableAgents: spawnableAgents,
      lookupAgent,
      maxDepth: 5,
    })

    return NextResponse.json(tree)
  } catch (error) {
    logger.error({ error }, 'Error fetching agent dependencies')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
