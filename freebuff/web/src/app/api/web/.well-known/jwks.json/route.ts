import { NextResponse } from 'next/server'

import { getVlyConvexJwks } from '@/lib/vly-convex-jwt'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(await getVlyConvexJwks(), {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
    },
  })
}
