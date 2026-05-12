import { NextResponse } from 'next/server'

import { getFreebuffLiveStats } from '@/server/live-stats'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const stats = await getFreebuffLiveStats()
  return NextResponse.json(stats, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
