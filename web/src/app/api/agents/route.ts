import { NextResponse } from 'next/server'

import { logger } from '@/util/logger'
import { applyCacheHeaders } from '@/server/apply-cache-headers'
import { getCachedAgents } from '@/server/agents-data'

// ISR Configuration for API route
export const revalidate = 600 // Cache for 10 minutes
export const dynamic = 'force-static'

export async function GET() {
  try {
    const result = await getCachedAgents()

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
