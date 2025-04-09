import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { eq } from 'drizzle-orm'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { logger } from '@/util/logger'

const MINIMUM_PURCHASE_CREDITS = 500 // Define the minimum credit purchase amount

// Schema for updating auto-top-up settings
const updateAutoTopupSchema = z.object({
  enabled: z.boolean(),
  threshold: z.number().int().positive().optional().nullable(),
  targetBalance: z.number().int().positive().optional().nullable(),
})

// GET handler to fetch current settings
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const userSettings = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        auto_topup_enabled: true,
        auto_topup_threshold: true,
        auto_topup_target_balance: true,
      },
    })

    if (!userSettings) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(userSettings)
  } catch (error) {
    logger.error(
      { error, userId },
      'Failed to fetch auto-top-up settings'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST handler to update settings
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let data
  try {
    data = await req.json()
    const validation = updateAutoTopupSchema.safeParse(data)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: validation.error.issues },
        { status: 400 }
      )
    }
    data = validation.data
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { enabled, threshold, targetBalance } = data

  // Validation logic
  if (enabled) {
    if (threshold === null || threshold === undefined) {
      return NextResponse.json(
        { error: 'Threshold is required when enabling auto-top-up' },
        { status: 400 }
      )
    }
    if (targetBalance === null || targetBalance === undefined) {
      return NextResponse.json(
        { error: 'Target balance is required when enabling auto-top-up' },
        { status: 400 }
      )
    }
    if (targetBalance <= threshold) {
      return NextResponse.json(
        { error: 'Target balance must be greater than the threshold' },
        { status: 400 }
      )
    }
    // Ensure the top-up amount meets the minimum purchase requirement
    if (targetBalance - threshold < MINIMUM_PURCHASE_CREDITS) {
        return NextResponse.json(
            { error: `The difference between target balance and threshold must be at least ${MINIMUM_PURCHASE_CREDITS} credits.` },
            { status: 400 }
        )
    }
  }

  try {
    await db
      .update(schema.user)
      .set({
        auto_topup_enabled: enabled,
        // Set to null if disabled or not provided
        auto_topup_threshold: enabled ? threshold : null,
        auto_topup_target_balance: enabled ? targetBalance : null,
      })
      .where(eq(schema.user.id, userId))

    logger.info(
      { userId, enabled, threshold, targetBalance },
      'Updated auto-top-up settings'
    )

    // Refetch and return updated settings
    const updatedSettings = await db.query.user.findFirst({
        where: eq(schema.user.id, userId),
        columns: {
            auto_topup_enabled: true,
            auto_topup_threshold: true,
            auto_topup_target_balance: true,
        },
    });

    return NextResponse.json(updatedSettings)
  } catch (error) {
    logger.error(
      { error, userId, enabled, threshold, targetBalance },
      'Failed to update auto-top-up settings'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}