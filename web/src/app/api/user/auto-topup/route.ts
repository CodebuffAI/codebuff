import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import { eq } from 'drizzle-orm'
import * as schema from 'common/db/schema'
import { z } from 'zod'

const autoTopupSchema = z.object({
  enabled: z.boolean(),
  threshold: z.number().nullable(),
  targetBalance: z.number().nullable(),
})

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = await request.json()
    const validatedData = autoTopupSchema.parse(data)

    // Validate the data
    if (validatedData.enabled && (validatedData.threshold === null || validatedData.targetBalance === null)) {
      return NextResponse.json(
        { error: 'Threshold and target balance are required when enabling auto top-up' },
        { status: 400 }
      )
    }

    if (validatedData.enabled && validatedData.threshold !== null && validatedData.targetBalance !== null) {
      if (validatedData.targetBalance <= validatedData.threshold) {
        return NextResponse.json(
          { error: 'Target balance must be greater than threshold' },
          { status: 400 }
        )
      }

      const topUpAmount = validatedData.targetBalance - validatedData.threshold
      const minTopUpCredits = 500 // Corresponds to $5 at 1 credit = 1 cent
      const maxTopUpCredits = 10000 // Corresponds to $100 at 1 credit = 1 cent

      if (topUpAmount < minTopUpCredits || topUpAmount > maxTopUpCredits) {
        return NextResponse.json(
          { error: `Top-up amount must be between ${minTopUpCredits} and ${maxTopUpCredits} credits` },
          { status: 400 }
        )
      }
    }

    // Update the user's auto top-up settings
    await db
      .update(schema.user)
      .set({
        auto_topup_enabled: validatedData.enabled,
        auto_topup_threshold: validatedData.threshold,
        auto_topup_target_balance: validatedData.targetBalance,
      })
      .where(eq(schema.user.id, session.user.id))

    return NextResponse.json({
      auto_topup_enabled: validatedData.enabled,
      auto_topup_threshold: validatedData.threshold,
      auto_topup_target_balance: validatedData.targetBalance,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', issues: error.issues },
        { status: 400 }
      )
    }

    console.error('Error updating auto top-up settings:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}