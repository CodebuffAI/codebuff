import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export type ReferralCodeResponse = {
  referrerName: string | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse<ReferralCodeResponse | { error: string }>> {
  const { code } = await params

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.referral_code, code),
      columns: { name: true },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid referral code' },
        { status: 400 },
      )
    }

    return NextResponse.json({ referrerName: user.name })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    )
  }
}
