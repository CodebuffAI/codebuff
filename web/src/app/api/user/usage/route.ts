import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import { and, eq, gt, or, sql } from 'drizzle-orm'
import * as schema from 'common/db/schema'
import { CreditBalance } from 'common/src/billing/balance-calculator'
import { GrantType } from 'common/db/schema'
import {
  getPlanFromPriceId,
  getMonthlyGrantForPlan,
} from 'common/src/billing/plans'
import { env } from '@/env.mjs'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    // Fetch user's quota reset date and stripe price id
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        next_quota_reset: true,
        stripe_price_id: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const now = new Date()
    const quotaResetDate = user.next_quota_reset ?? new Date(0)

    // SQL helper for checking if a grant is currently active
    const isActive = sql<boolean>`
      ${schema.creditLedger.expires_at} IS NULL OR 
      ${schema.creditLedger.expires_at} > ${now}
    `

    // SQL helper for positive balance amount
    const positiveBalance = sql<number>`
      CASE WHEN ${schema.creditLedger.balance} > 0 
      THEN ${schema.creditLedger.balance} 
      ELSE 0 END
    `

    // SQL helper for negative balance amount (as positive number)
    const debtAmount = sql<number>`
      CASE WHEN ${schema.creditLedger.balance} < 0 
      THEN ABS(${schema.creditLedger.balance}) 
      ELSE 0 END
    `

    // SQL helper for current balance of active grants
    const activeBalance = sql<number>`
      CASE WHEN ${isActive} THEN ${positiveBalance} ELSE 0 END
    `

    // SQL helper for current debt of active grants
    const activeDebt = sql<number>`
      CASE WHEN ${isActive} THEN ${debtAmount} ELSE 0 END
    `

    // SQL helper for usage calculation
    const usage = sql<number>`
      ${schema.creditLedger.principal} - ${schema.creditLedger.balance}
    `

    // Get all grant totals in a single query
    const grantTotals = await db
      .select({
        // Current balances (only active grants)
        currentBalance: sql<number>`
          COALESCE(SUM(${activeBalance})::integer, 0)`,
        // Total debt (only active grants)
        totalDebt: sql<number>`
          COALESCE(SUM(${activeDebt})::integer, 0)`,
        // Usage this cycle (all grants)
        usageThisCycle: sql<number>`
          COALESCE(SUM(${usage})::integer, 0)`,
        // Type-specific totals
        type: schema.creditLedger.type,
        // Current balance per type
        typeBalance: sql<number>`
          COALESCE(SUM(${activeBalance})::integer, 0)`,
        // Principal per type
        typePrincipal: sql<number>`
          COALESCE(SUM(${schema.creditLedger.principal})::integer, 0)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.user_id, userId),
          // Created before now and either:
          // - Created after cycle start, OR
          // - Expires after cycle start (or never expires)
          sql`${schema.creditLedger.created_at} <= ${now}`,
          or(
            gt(schema.creditLedger.created_at, quotaResetDate),
            sql`${schema.creditLedger.expires_at} IS NULL`,
            gt(schema.creditLedger.expires_at, quotaResetDate)
          )
        )
      )
      .groupBy(schema.creditLedger.type)

    // Initialize balance structure with all grant types set to 0
    const balance: CreditBalance = {
      totalRemaining: 0,
      totalDebt: 0,
      netBalance: 0,
      breakdown: {
        free: 0,
        referral: 0,
        purchase: 0,
        admin: 0,
      },
      principals: {
        free: 0,
        referral: 0,
        purchase: 0,
        admin: 0,
      },
    }

    let usageThisCycle = 0

    // Process totals from the query
    for (const total of grantTotals) {
      const grantType = total.type as GrantType
      
      // Add to type-specific totals (overwriting the 0 defaults)
      balance.breakdown[grantType] = total.typeBalance
      balance.principals[grantType] = total.typePrincipal

      // Add to overall totals
      balance.totalRemaining += total.currentBalance
      balance.totalDebt += total.totalDebt
      usageThisCycle += total.usageThisCycle
    }

    // Calculate net balance
    balance.netBalance = balance.totalRemaining - balance.totalDebt

    // Calculate next monthly grant
    const currentPlan = getPlanFromPriceId(
      user.stripe_price_id,
      env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
      env.NEXT_PUBLIC_STRIPE_MOAR_PRO_PRICE_ID
    )
    const nextMonthlyGrant = await getMonthlyGrantForPlan(currentPlan, userId)

    // Prepare the response data
    const usageData = {
      usageThisCycle,
      balance,
      nextQuotaReset: user.next_quota_reset,
      nextMonthlyGrant,
    }

    return NextResponse.json(usageData)
  } catch (error) {
    console.error('Error fetching usage data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
