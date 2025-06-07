import db from '@codebuff/internal/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import * as schema from '@codebuff/internal/db/schema'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/auth-options'
import { hasMaxedReferrals, ReferralStatus } from '@/lib/server/referral'

export type ReferralCodeResponse = {
  referrerName: string | null
  isSameUser: boolean
  status: ReferralStatus
}

export async function GET(
  _req: Request,
  { params }: { params: { code: string } }
): Promise<NextResponse<ReferralCodeResponse | { error: string }>> {
  const { code } = params
  const session = await getServerSession(authOptions)

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

    const isSameUser = user.id === session?.user?.id
    const referralStatus = await hasMaxedReferrals(user.id)

    return NextResponse.json({
      referrerName: user.name,
      isSameUser,
      status: referralStatus,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
