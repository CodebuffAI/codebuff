import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { signVlyConvexToken } from '@/lib/vly-convex-jwt'
import { resolveFreebuffWebGeoAccess } from '@/server/geo'
import { syncWebReferralState } from '@/server/web-referrals'
import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user

  if (!user?.id || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Geographic access tier rides along as a JWT claim: this route is the
  // only place in the browser -> Convex path where request headers (country,
  // IP, client hints) are visible, and the token refreshes every <=10 min so
  // the tier tracks IP changes without extra requests.
  const [geoAccess, webReferralScore] = await Promise.all([
    resolveFreebuffWebGeoAccess({
      userId: user.id,
      headers: req.headers,
    }),
    // Web referrals live in the shared Postgres referral ledger; the score
    // rides along as a JWT claim so Convex can size tier-scaled limits
    // without its own referral bookkeeping. This also redeems the referral
    // attribution cookie and ages in any pending referral.
    syncWebReferralState({ userId: user.id }).catch((error) => {
      logger.warn(
        { error, userId: user.id },
        'Failed to sync web referral state; defaulting score to 0',
      )
      return 0
    }),
  ])

  const token = await signVlyConvexToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    accessTier: geoAccess.accessTier,
    countryCode: geoAccess.countryCode,
    webReferralScore,
  })

  return NextResponse.json({ token })
}
