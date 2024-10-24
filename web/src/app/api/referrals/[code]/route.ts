import db from 'common/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import * as schema from 'common/db/schema'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/auth-options'
import { hasMaxedReferrals } from 'common/util/server/referral'

export async function GET(
  _req: Request,
  { params }: { params: { code: string } }
) {
  const { code } = params
  const session = await getServerSession(authOptions)

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.referral_code, code),
      columns: {
        name: true,
        id: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid referral code' },
        { status: 400 }
      )
    }

    const isSameUser = user.id === session.user.id
    const referralStatus = await hasMaxedReferrals(user.id)
    const hasReachedLimit = referralStatus.reason !== undefined

    return NextResponse.json({ 
      referrerName: user.name, 
      isSameUser,
      hasReachedLimit 
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
