import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { eq } from 'drizzle-orm'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { logger } from '@/util/logger'
import { convertStripeGrantAmountToCredits } from 'common/src/billing/credit-conversion'

// Define constants consistent with frontend
const MIN_THRESHOLD_CREDITS = 100;
const MAX_THRESHOLD_CREDITS = 10000;
const MIN_TOPUP_DOLLARS = 5.00;
const MAX_TOPUP_DOLLARS = 100.00;
const CENTS_PER_CREDIT = 1; // Assuming 1 cent per credit

// Calculate min/max top-up credits based on dollar amounts
const MIN_TOPUP_CREDITS = convertStripeGrantAmountToCredits(MIN_TOPUP_DOLLARS * 100, CENTS_PER_CREDIT);
const MAX_TOPUP_CREDITS = convertStripeGrantAmountToCredits(MAX_TOPUP_DOLLARS * 100, CENTS_PER_CREDIT);

// Schema for updating auto-top-up settings with refined validation
const updateAutoTopupSchema = z.object({
  enabled: z.boolean(),
  threshold: z.number()
    .int()
    .min(MIN_THRESHOLD_CREDITS, `Threshold must be at least ${MIN_THRESHOLD_CREDITS}.`)
    .max(MAX_THRESHOLD_CREDITS, `Threshold cannot exceed ${MAX_THRESHOLD_CREDITS}.`)
    .optional()
    .nullable(),
  targetBalance: z.number()
    .int()
    .positive("Target balance must be positive.")
    .optional()
    .nullable(),
}).refine(data => {
    // If enabled, both threshold and targetBalance must be provided
    if (data.enabled && (data.threshold === null || data.threshold === undefined)) return false;
    if (data.enabled && (data.targetBalance === null || data.targetBalance === undefined)) return false;
    return true;
}, {
    message: "Threshold and Target Balance are required when enabling auto-top-up.",
    path: ["enabled"], // Path indicating the issue relates to the enabled state requirements
}).refine(data => {
    // If enabled, targetBalance must be greater than threshold
    if (data.enabled && data.targetBalance !== null && data.threshold !== null && data.targetBalance <= data.threshold) return false;
    return true;
}, {
    message: "Target balance must be greater than the threshold.",
    path: ["targetBalance"], // Path indicating the issue relates to targetBalance
}).refine(data => {
    // If enabled, the difference (top-up amount) must be within the allowed credit range
    if (data.enabled && data.targetBalance !== null && data.threshold !== null) {
        const topUpAmount = data.targetBalance - data.threshold;
        if (topUpAmount < MIN_TOPUP_CREDITS || topUpAmount > MAX_TOPUP_CREDITS) return false;
    }
    return true;
}, {
    message: `Top-up amount (Target Balance - Threshold) must result in between ${MIN_TOPUP_CREDITS} and ${MAX_TOPUP_CREDITS} credits.`,
    path: ["targetBalance"], // Path indicating the issue relates to the calculated top-up amount
});

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

  let rawData;
  try {
    rawData = await req.json()
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validation = updateAutoTopupSchema.safeParse(rawData)
  if (!validation.success) {
    // Log the specific validation errors
    logger.warn({ userId, errors: validation.error.issues }, 'Auto-topup validation failed');
    return NextResponse.json(
      { error: 'Invalid input', issues: validation.error.issues },
      { status: 400 }
    )
  }

  const { enabled, threshold, targetBalance } = validation.data

  // Note: Specific validation logic is now handled by the Zod schema refinements.

  try {
    await db
      .update(schema.user)
      .set({
        auto_topup_enabled: enabled,
        // Set to null if disabled, otherwise use the validated value
        auto_topup_threshold: enabled ? threshold : null,
        auto_topup_target_balance: enabled ? targetBalance : null,
      })
      .where(eq(schema.user.id, userId))

    logger.info(
      { userId, enabled, threshold, targetBalance },
      'Updated auto-top-up settings'
    )

    // Refetch and return updated settings to confirm changes
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
      'Failed to update auto-top-up settings in DB'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}