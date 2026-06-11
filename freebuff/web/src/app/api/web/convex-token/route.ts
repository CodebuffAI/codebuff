import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { signVlyConvexToken } from '@/lib/vly-convex-jwt'
import { resolveFreebuffWebGeoAccess } from '@/server/geo'

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
  const geoAccess = await resolveFreebuffWebGeoAccess({
    userId: user.id,
    headers: req.headers,
  })

  const token = await signVlyConvexToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    accessTier: geoAccess.accessTier,
    countryCode: geoAccess.countryCode,
  })

  return NextResponse.json({ token })
}
