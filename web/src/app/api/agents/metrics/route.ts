import { NextResponse } from 'next/server'

import { logger } from '@/util/logger'
import { applyCacheHeaders } from '@/server/apply-cache-headers'
import { getCachedAgentsMetrics } from '@/server/agents-data'

// ISR Configuration for API route - metrics can be cached
export const revalidate = 600 // Cache for 10 minutes
export const dynamic = 'force-static'

export async function GET() {
  try {
    const metrics = await getCachedAgentsMetrics()

    const response = NextResponse.json(metrics)
    return applyCacheHeaders(response)
  } catch (error) {
    logger.error({ error }, 'Error fetching agent metrics')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
