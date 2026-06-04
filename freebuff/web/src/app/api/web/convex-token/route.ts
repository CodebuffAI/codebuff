import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { signVlyConvexToken } from '@/lib/vly-convex-jwt'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user

  if (!user?.id || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await signVlyConvexToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
  })

  return NextResponse.json({ token })
}
