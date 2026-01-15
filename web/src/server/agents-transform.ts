export interface AgentRow {
  id: string
  version: string
  data: any
  created_at: string | Date
  publisher: {
    id: string
    name: string
    verified: boolean
    avatar_url?: string | null
  }
}

// Slim agent row with pre-extracted JSON fields (for optimized lite queries)
export interface AgentRowSlim {
  id: string
  version: string
  name: string | null
  description: string | null
  tags: string[] | null
  created_at: string | Date
  publisher: {
    id: string
    name: string
    verified: boolean
    avatar_url?: string | null
  }
}

// Minimal agent row for sitemap (no data fields at all)
export interface AgentRowSitemap {
  id: string
  version: string
  created_at: string | Date
  publisher_id: string
}

export interface SitemapMetricRow {
  publisher_id: string | null
  agent_id: string | null
  last_used: Date | string | null
}

export interface SitemapAgentDataOut {
  id: string
  version: string
  publisher_id: string
  created_at: string
  last_used?: string
}

// Basic agent info without metrics - for lightweight SSR
export interface AgentBasicInfo {
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
  tags?: string[]
}

// Metrics data keyed by publisher/agentName
export interface AgentMetrics {
  usage_count: number
  weekly_runs: number
  weekly_spent: number
  total_spent: number
  avg_cost_per_invocation: number
  unique_users: number
  last_used?: string
}

export interface UsageMetricRow {
  publisher_id: string | null
  agent_name: string | null
  total_invocations: number | string
  total_dollars: number | string
  avg_cost_per_run: number | string
  unique_users: number | string
  last_used: Date | string | null
}

export interface WeeklyMetricRow {
  publisher_id: string | null
  agent_name: string | null
  weekly_runs: number | string
  weekly_dollars: number | string
}

export interface PerVersionMetricRow {
  publisher_id: string | null
  agent_name: string | null
  agent_version: string | null
  total_invocations: number | string
  total_dollars: number | string
  avg_cost_per_run: number | string
  unique_users: number | string
  last_used: Date | string | null
}

export interface PerVersionWeeklyMetricRow {
  publisher_id: string | null
  agent_name: string | null
  agent_version: string | null
  weekly_runs: number | string
  weekly_dollars: number | string
}

export interface AgentDataOut {
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

export function buildAgentsData(params: {
  agents: AgentRow[]
  usageMetrics: UsageMetricRow[]
  weeklyMetrics: WeeklyMetricRow[]
  perVersionMetrics: PerVersionMetricRow[]
  perVersionWeeklyMetrics: PerVersionWeeklyMetricRow[]
}): AgentDataOut[] {
  const {
    agents,
    usageMetrics,
    weeklyMetrics,
    perVersionMetrics,
    perVersionWeeklyMetrics,
  } = params

  const weeklyMap = new Map<
    string,
    { weekly_runs: number; weekly_dollars: number }
  >()
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
      last_used: Date | string | null
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
        last_used: metric.last_used
          ? typeof metric.last_used === 'string'
            ? metric.last_used
            : metric.last_used.toISOString()
          : null,
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
    { agent: AgentRow; agentData: any; agentName: string }
  >()
  agents.forEach((agent) => {
    const agentData =
      typeof agent.data === 'string' ? JSON.parse(agent.data) : agent.data
    const agentName = agentData?.name || agent.id
    const key = `${agent.publisher.id}/${agentName}`
    if (!latestAgents.has(key)) {
      latestAgents.set(key, { agent, agentData, agentName })
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
          { ...stats, last_used: (stats as any)?.last_used ?? undefined },
        ]),
      )

      return {
        id: agent.id,
        name: agentName,
        description: agentData?.description,
        publisher: agent.publisher,
        version: agent.version,
        created_at:
          agent.created_at instanceof Date
            ? agent.created_at.toISOString()
            : (agent.created_at as string),
        usage_count: metrics.total_invocations,
        weekly_runs: metrics.weekly_runs,
        weekly_spent: metrics.weekly_dollars,
        total_spent: metrics.total_dollars,
        avg_cost_per_invocation: metrics.avg_cost_per_run,
        unique_users: metrics.unique_users,
        last_used: metrics.last_used
          ? typeof metrics.last_used === 'string'
            ? metrics.last_used
            : metrics.last_used.toISOString()
          : undefined,
        version_stats,
        tags: agentData?.tags || [],
      }
    },
  )

  result.sort((a, b) => (b.weekly_spent || 0) - (a.weekly_spent || 0))
  return result
}

export function buildAgentsDataLite(params: {
  agents: AgentRowSlim[]
  usageMetrics: UsageMetricRow[]
  weeklyMetrics: WeeklyMetricRow[]
}): AgentDataOut[] {
  const { agents, usageMetrics, weeklyMetrics } = params

  const weeklyMap = new Map<
    string,
    { weekly_runs: number; weekly_dollars: number }
  >()
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
      last_used: Date | string | null
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

  // With slim rows, name/description/tags are pre-extracted from the JSON
  const latestAgents = new Map<
    string,
    { agent: AgentRowSlim; agentName: string }
  >()
  agents.forEach((agent) => {
    const agentName = agent.name || agent.id
    const key = `${agent.publisher.id}/${agentName}`
    if (!latestAgents.has(key)) {
      latestAgents.set(key, { agent, agentName })
    }
  })

  const result = Array.from(latestAgents.values()).map(
    ({ agent, agentName }) => {
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

      // Parse tags if they came as a JSON string from the database
      let tags: string[] = []
      if (agent.tags) {
        if (typeof agent.tags === 'string') {
          try {
            tags = JSON.parse(agent.tags)
          } catch {
            tags = []
          }
        } else {
          tags = agent.tags
        }
      }

      return {
        id: agent.id,
        name: agentName,
        description: agent.description || undefined,
        publisher: agent.publisher,
        version: agent.version,
        created_at:
          agent.created_at instanceof Date
            ? agent.created_at.toISOString()
            : (agent.created_at as string),
        usage_count: metrics.total_invocations,
        weekly_runs: metrics.weekly_runs,
        weekly_spent: metrics.weekly_dollars,
        total_spent: metrics.total_dollars,
        avg_cost_per_invocation: metrics.avg_cost_per_run,
        unique_users: metrics.unique_users,
        last_used: metrics.last_used
          ? typeof metrics.last_used === 'string'
            ? metrics.last_used
            : metrics.last_used.toISOString()
          : undefined,
        tags,
      }
    },
  )

  result.sort((a, b) => (b.weekly_spent || 0) - (a.weekly_spent || 0))
  return result
}

// Build basic agent info without any metrics - for lightweight initial page load
export function buildAgentsBasicInfo(params: {
  agents: AgentRowSlim[]
}): AgentBasicInfo[] {
  const { agents } = params

  // Dedupe to latest version per agent (stable by publisher + agent id).
  const latestAgents = new Map<
    string,
    { agent: AgentRowSlim; agentName: string }
  >()
  agents.forEach((agent) => {
    const agentName = agent.name || agent.id
    const key = `${agent.publisher.id}/${agent.id}`
    if (!latestAgents.has(key)) {
      latestAgents.set(key, { agent, agentName })
    }
  })

  const result = Array.from(latestAgents.values()).map(({ agent, agentName }) => {
    // Parse tags if they came as a JSON string from the database
    let tags: string[] = []
    if (agent.tags) {
      if (typeof agent.tags === 'string') {
        try {
          tags = JSON.parse(agent.tags)
        } catch {
          tags = []
        }
      } else {
        tags = agent.tags
      }
    }

    return {
      id: agent.id,
      name: agentName,
      description: agent.description || undefined,
      publisher: agent.publisher,
      version: agent.version,
      created_at:
        agent.created_at instanceof Date
          ? agent.created_at.toISOString()
          : (agent.created_at as string),
      tags,
    }
  })

  // Sort alphabetically by name as default (metrics-based sorting happens client-side)
  result.sort((a, b) => a.name.localeCompare(b.name))
  return result
}

// Build metrics map from usage data - keyed by "publisherId/agentId"
export function buildAgentsMetricsMap(params: {
  usageMetrics: UsageMetricRow[]
  weeklyMetrics: WeeklyMetricRow[]
}): Record<string, AgentMetrics> {
  const { usageMetrics, weeklyMetrics } = params

  const weeklyMap = new Map<
    string,
    { weekly_runs: number; weekly_dollars: number }
  >()
  weeklyMetrics.forEach((metric) => {
    if (metric.publisher_id && metric.agent_name) {
      const key = `${metric.publisher_id}/${metric.agent_name}`
      weeklyMap.set(key, {
        weekly_runs: Number(metric.weekly_runs),
        weekly_dollars: Number(metric.weekly_dollars),
      })
    }
  })

  const metricsMap: Record<string, AgentMetrics> = {}
  usageMetrics.forEach((metric) => {
    if (metric.publisher_id && metric.agent_name) {
      const key = `${metric.publisher_id}/${metric.agent_name}`
      const weeklyData = weeklyMap.get(key) || {
        weekly_runs: 0,
        weekly_dollars: 0,
      }
      metricsMap[key] = {
        usage_count: Number(metric.total_invocations),
        weekly_runs: weeklyData.weekly_runs,
        weekly_spent: weeklyData.weekly_dollars,
        total_spent: Number(metric.total_dollars),
        avg_cost_per_invocation: Number(metric.avg_cost_per_run),
        unique_users: Number(metric.unique_users),
        last_used: metric.last_used
          ? typeof metric.last_used === 'string'
            ? metric.last_used
            : metric.last_used.toISOString()
          : undefined,
      }
    }
  })

  return metricsMap
}

export function buildAgentsDataForSitemap(params: {
  agents: AgentRowSitemap[]
  metrics: SitemapMetricRow[]
}): SitemapAgentDataOut[] {
  const { agents, metrics } = params

  // Build map of last_used dates by publisher/agent
  const lastUsedMap = new Map<string, Date | string>()
  metrics.forEach((metric) => {
    if (metric.publisher_id && metric.agent_id && metric.last_used) {
      const key = `${metric.publisher_id}/${metric.agent_id}`
      lastUsedMap.set(key, metric.last_used)
    }
  })

  // Dedupe to latest version per agent
  const latestAgents = new Map<string, AgentRowSitemap>()
  agents.forEach((agent) => {
    const key = `${agent.publisher_id}/${agent.id}`
    if (!latestAgents.has(key)) {
      latestAgents.set(key, agent)
    }
  })

  return Array.from(latestAgents.values()).map((agent) => {
    const metricKey = `${agent.publisher_id}/${agent.id}`
    const lastUsed = lastUsedMap.get(metricKey)

    return {
      id: agent.id,
      version: agent.version,
      publisher_id: agent.publisher_id,
      created_at:
        agent.created_at instanceof Date
          ? agent.created_at.toISOString()
          : (agent.created_at as string),
      last_used: lastUsed
        ? typeof lastUsed === 'string'
          ? lastUsed
          : lastUsed.toISOString()
        : undefined,
    }
  })
}
