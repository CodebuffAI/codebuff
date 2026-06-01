import { NextResponse } from 'next/server'

import { getFreebuffLatencyStats } from '@/server/latency-stats'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const stats = await getFreebuffLatencyStats()
  return NextResponse.json(stats, {
    headers: {
      'Cache-Control':
        'public, max-age=0, s-maxage=60, stale-while-revalidate=30',
    },
  })
}
