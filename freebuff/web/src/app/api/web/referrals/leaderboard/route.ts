import { NextResponse } from 'next/server'

import { getReferralLeaderboard } from '@/server/referral-leaderboard'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const limit = Number(url.searchParams.get('limit') ?? 10)
  const leaderboard = await getReferralLeaderboard(limit)

  return NextResponse.json({ leaderboard })
}
