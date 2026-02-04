import { NextResponse } from 'next/server'

import { fetchAgentsWithMetrics } from '@/server/agents-data'
import { applyCacheHeaders } from '@/server/apply-cache-headers'
import { logger } from '@/util/logger'

// ISR Configuration for API route
export const revalidate = 600 // Cache for 10 minutes
export const dynamic = 'force-static'

export async function GET() {
  try {
    // Note: We use fetchAgentsWithMetrics directly instead of getCachedAgents
    // because the payload is >2MB and unstable_cache has a 2MB limit.
    // ISR page-level caching (revalidate: 600) handles caching adequately.
    const result = await fetchAgentsWithMetrics()

    const response = NextResponse.json(result)
    return applyCacheHeaders(response)
  } catch (error) {
    logger.error({ error }, 'Error fetching agents')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
