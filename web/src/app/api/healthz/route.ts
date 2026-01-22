import { NextResponse } from 'next/server'
import { getAgentCount } from '@/server/agents-data'

export const GET = async () => {
  try {
    // Get a lightweight count of agents without caching the full data
    // This avoids the unstable_cache 2MB limit warning
    const agentCount = await getAgentCount()

    return NextResponse.json({
      status: 'ok',
      cached_agents: agentCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Healthz] Failed to get agent count:', error)

    // Still return 200 so health check passes, but indicate the error
    return NextResponse.json({
      status: 'ok',
      agent_count_error: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
