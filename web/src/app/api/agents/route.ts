import { NextResponse } from 'next/server'

import { logger } from '@/util/logger'
import { getCachedAgents } from '@/server/agents-data'

// ISR Configuration for API route
export const revalidate = 600 // Cache for 10 minutes
export const dynamic = 'force-static'

export async function GET() {
  try {
    const result = await getCachedAgents()

    const response = NextResponse.json(result)

    // Add optimized cache headers for better performance
    response.headers.set(
      'Cache-Control',
      'public, max-age=300, s-maxage=600, stale-while-revalidate=3600',
    )

    // Add compression and optimization headers
    response.headers.set('Vary', 'Accept-Encoding')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Content-Type', 'application/json; charset=utf-8')

    return response
  } catch (error) {
    logger.error({ error }, 'Error fetching agents')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
