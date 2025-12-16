import { NextResponse } from 'next/server'
import { getCachedAgentsLite } from '@/server/agents-data'

export const GET = async () => {
  try {
    // Warm the cache by fetching agents data
    // This ensures SEO-critical data is available immediately
    const agents = await getCachedAgentsLite()

    return NextResponse.json({
      status: 'ok',
      cached_agents: agents.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Healthz] Failed to warm cache:', error)

    // Still return 200 so health check passes, but indicate cache warming failed
    return NextResponse.json({
      status: 'ok',
      cache_warm: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
