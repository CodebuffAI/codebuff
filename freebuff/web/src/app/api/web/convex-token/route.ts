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
  // the tier tracks IP changes without extra requests. Resolved before the
  // referral sync (not in parallel) because the sync activates the user's own
  // referral at this verified tier — the usual case is a warm cache hit, so
  // the added latency is one fast read.
  const geoAccess = await resolveFreebuffWebGeoAccess({
    userId: user.id,
    headers: req.headers,
  })

  // Web referrals live in the shared Postgres referral ledger; the score
  // rides along as a JWT claim so Convex can size tier-scaled limits
  // without its own referral bookkeeping. This also redeems the referral
  // attribution cookie, ages in any pending referral, and — since this route
  // only fires while the signed-in web app is open (the web surface's
  // product-use signal) — activates the user's own referral at the request's
  // verified tier. Hard-blocked requests never activate.
  const webReferralScore = await syncWebReferralState({
    userId: user.id,
    // The geo pipeline's own hash (not re-derived from headers) so the value
    // is byte-identical to the free_mode_country_access_cache row it must
    // join against, including paths where the pipeline nulls it.
    clientIpHash: geoAccess.clientIpHash,
    ...(geoAccess.accessTier === 'blocked'
      ? {}
      : { activation: { accessTier: geoAccess.accessTier } }),
  }).catch((error) => {
    logger.warn(
      { error, userId: user.id },
      'Failed to sync web referral state; defaulting score to 0',
    )
    return 0
  })

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
