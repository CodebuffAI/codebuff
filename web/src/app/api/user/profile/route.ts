import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import { eq } from 'drizzle-orm'
import * as schema from 'common/db/schema'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, session.user.id),
      columns: { handle: true, referral_code: true },
    })

    if (!user) {
      // Should not happen if session is valid, but good practice
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ handle: user.handle, referralCode: user.referral_code })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}