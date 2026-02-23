import { PROFIT_MARGIN } from '@codebuff/common/constants/limits'
import { SUBSCRIPTION_TIERS } from '@codebuff/common/constants/subscription-plans'
import { db } from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq, gte, inArray, sql } from 'drizzle-orm'

const WEEKS_PER_MONTH = 4.33
const COST_PER_CREDIT = 1 / ((1 + PROFIT_MARGIN) * 100) // ~$0.009479
const EXCLUDED_EMAILS = ['jahooma@gmail.com']

interface TierAnalysis {
  tier: number
  monthlyPrice: number
  subscriberCount: number
  avgWeeklyCredits: number
  medianWeeklyCredits: number
  maxWeeklyCredits: number
  projectedMonthlyCredits: number
  projectedMonthlyCost: number
  monthlyRevenue: number
  projectedMonthlyProfit: number
  breakEvenCreditsPerMonth: number
  weeklyLimit: number
  avgUtilization: number
  subscribers: Array<{
    email: string
    weeklyCredits: number
    projectedMonthlyProfit: number
    utilization: number
  }>
}

async function analyzeSubscriberProfitability() {
  const lookbackDays = Math.max(1, parseInt(process.argv[2] || '7'))
  const lookbackDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)

  console.log(`\n${'='.repeat(80)}`)
  console.log(`  SUBSCRIBER PROFITABILITY ANALYSIS`)
  console.log(`  Lookback: ${lookbackDays} days (since ${lookbackDate.toISOString().split('T')[0]})`)
  console.log(`  Cost per credit: $${COST_PER_CREDIT.toFixed(6)} (PROFIT_MARGIN=${PROFIT_MARGIN})`)
  console.log(`${'='.repeat(80)}\n`)

  try {
    // Get all active subscribers with their tier
    const activeSubscribers = await db
      .select({
        userId: schema.subscription.user_id,
        tier: schema.subscription.tier,
        email: schema.user.email,
        billingPeriodStart: schema.subscription.billing_period_start,
        billingPeriodEnd: schema.subscription.billing_period_end,
      })
      .from(schema.subscription)
      .leftJoin(schema.user, eq(schema.subscription.user_id, schema.user.id))
      .where(eq(schema.subscription.status, 'active'))

    // Exclude internal emails
    const filteredSubscribers = activeSubscribers.filter(
      (s) => !EXCLUDED_EMAILS.includes(s.email ?? ''),
    )

    console.log(`Found ${activeSubscribers.length} active subscribers (${activeSubscribers.length - filteredSubscribers.length} excluded)\n`)

    if (filteredSubscribers.length === 0) {
      console.log('No active subscribers found (after exclusions).')
      return
    }

    // Get subscription credit usage from the credit_ledger
    // Usage = principal - balance (how much of each subscription grant has been consumed)
    const subscriberUserIds = filteredSubscribers
      .filter((s) => s.userId)
      .map((s) => s.userId!)

    const usageByUser = subscriberUserIds.length > 0
      ? await db
          .select({
            userId: schema.creditLedger.user_id,
            totalCredits: sql<number>`COALESCE(SUM(${schema.creditLedger.principal} - ${schema.creditLedger.balance}), 0)`,
          })
          .from(schema.creditLedger)
          .where(
            and(
              eq(schema.creditLedger.type, 'subscription'),
              gte(schema.creditLedger.created_at, lookbackDate),
              inArray(schema.creditLedger.user_id, subscriberUserIds),
            ),
          )
          .groupBy(schema.creditLedger.user_id)
      : []

    const usageMap = new Map(
      usageByUser.map((u) => [u.userId, { credits: u.totalCredits }]),
    )

    // Group subscribers by tier and analyze
    const tierGroups = new Map<number, typeof filteredSubscribers>()
    for (const sub of filteredSubscribers) {
      const tier = sub.tier ?? 200 // default tier
      if (!tierGroups.has(tier)) tierGroups.set(tier, [])
      tierGroups.get(tier)!.push(sub)
    }

    const tierAnalyses: TierAnalysis[] = []

    for (const [tierPrice, subscribers] of [...tierGroups.entries()].sort((a, b) => a[0] - b[0])) {
      const tierConfig = SUBSCRIPTION_TIERS[tierPrice as keyof typeof SUBSCRIPTION_TIERS]
      if (!tierConfig) {
        console.log(`Unknown tier: $${tierPrice} (${subscribers.length} subscribers) — skipping`)
        continue
      }

      const subscriberData = subscribers.map((sub) => {
        const usage = usageMap.get(sub.userId!) ?? { credits: 0 }
        // Normalize to 7-day usage for weekly projection
        const weeklyCredits = (usage.credits / lookbackDays) * 7
        const projectedMonthlyCredits = weeklyCredits * WEEKS_PER_MONTH
        const projectedMonthlyCost = projectedMonthlyCredits * COST_PER_CREDIT
        const projectedMonthlyProfit = tierConfig.monthlyPrice - projectedMonthlyCost
        const utilization = tierConfig.weeklyCreditsLimit > 0
          ? (weeklyCredits / tierConfig.weeklyCreditsLimit) * 100
          : 0

        return {
          email: sub.email ?? sub.userId ?? 'Unknown',
          weeklyCredits: Math.round(weeklyCredits),
          projectedMonthlyProfit: Math.round(projectedMonthlyProfit * 100) / 100,
          utilization: Math.round(utilization * 10) / 10,

        }
      })

      // Sort by usage descending
      subscriberData.sort((a, b) => b.weeklyCredits - a.weeklyCredits)

      const weeklyCreditsArr = subscriberData.map((s) => s.weeklyCredits).sort((a, b) => a - b)
      const avgWeeklyCredits = weeklyCreditsArr.reduce((a, b) => a + b, 0) / (weeklyCreditsArr.length || 1)
      const medianWeeklyCredits = weeklyCreditsArr.length > 0
        ? weeklyCreditsArr[Math.floor(weeklyCreditsArr.length / 2)]
        : 0
      const maxWeeklyCredits = weeklyCreditsArr.length > 0
        ? weeklyCreditsArr[weeklyCreditsArr.length - 1]
        : 0

      const projectedMonthlyCredits = avgWeeklyCredits * WEEKS_PER_MONTH
      const projectedMonthlyCost = projectedMonthlyCredits * COST_PER_CREDIT
      const breakEvenCreditsPerMonth = tierConfig.monthlyPrice / COST_PER_CREDIT

      const analysis: TierAnalysis = {
        tier: tierPrice,
        monthlyPrice: tierConfig.monthlyPrice,
        subscriberCount: subscribers.length,
        avgWeeklyCredits: Math.round(avgWeeklyCredits),
        medianWeeklyCredits,
        maxWeeklyCredits,
        projectedMonthlyCredits: Math.round(projectedMonthlyCredits),
        projectedMonthlyCost: Math.round(projectedMonthlyCost * 100) / 100,
        monthlyRevenue: tierConfig.monthlyPrice * subscribers.length,
        projectedMonthlyProfit: Math.round((tierConfig.monthlyPrice - projectedMonthlyCost) * 100) / 100,
        breakEvenCreditsPerMonth: Math.round(breakEvenCreditsPerMonth),
        weeklyLimit: tierConfig.weeklyCreditsLimit,
        avgUtilization: Math.round(
          (avgWeeklyCredits / tierConfig.weeklyCreditsLimit) * 1000,
        ) / 10,
        subscribers: subscriberData,
      }

      tierAnalyses.push(analysis)
    }

    // Print tier-level summary
    console.log(`${'─'.repeat(80)}`)
    console.log(`  TIER SUMMARY (projected from ${lookbackDays}-day usage → monthly)`)
    console.log(`${'─'.repeat(80)}\n`)

    for (const t of tierAnalyses) {
      const profitIcon = t.projectedMonthlyProfit >= 0 ? '✅' : '❌'
      const maxMonthlyCredits = t.weeklyLimit * WEEKS_PER_MONTH
      const maxMonthlyCost = maxMonthlyCredits * COST_PER_CREDIT

      console.log(`  ┌─ $${t.tier}/mo Tier (${t.subscriberCount} subscriber${t.subscriberCount !== 1 ? 's' : ''})`)
      console.log(`  │  Weekly limit: ${t.weeklyLimit.toLocaleString()} credits`)
      console.log(`  │  Break-even: ${t.breakEvenCreditsPerMonth.toLocaleString()} credits/mo (${((t.breakEvenCreditsPerMonth / (maxMonthlyCredits)) * 100).toFixed(1)}% utilization)`)
      console.log(`  │  Max monthly cost: $${maxMonthlyCost.toFixed(2)} (at 100% utilization)`)
      console.log(`  │`)
      console.log(`  │  Avg weekly usage:    ${t.avgWeeklyCredits.toLocaleString()} credits (${t.avgUtilization}% of limit)`)
      console.log(`  │  Median weekly usage: ${t.medianWeeklyCredits.toLocaleString()} credits`)
      console.log(`  │  Max weekly usage:    ${t.maxWeeklyCredits.toLocaleString()} credits`)
      console.log(`  │`)
      console.log(`  │  Projected avg monthly cost:   $${t.projectedMonthlyCost.toFixed(2)}`)
      console.log(`  │  ${profitIcon} Projected avg monthly profit: $${t.projectedMonthlyProfit.toFixed(2)} per subscriber`)
      console.log(`  │  Total tier revenue: $${t.monthlyRevenue.toLocaleString()}/mo`)

      const totalTierCost = t.subscribers.reduce(
        (sum, s) => sum + (s.weeklyCredits * WEEKS_PER_MONTH * COST_PER_CREDIT),
        0,
      )
      const totalTierProfit = t.monthlyRevenue - totalTierCost
      const tierProfitIcon = totalTierProfit >= 0 ? '✅' : '❌'
      console.log(`  │  ${tierProfitIcon} Total tier profit:   $${totalTierProfit.toFixed(2)}/mo`)

      // Count profitable vs unprofitable subscribers
      const profitable = t.subscribers.filter((s) => s.projectedMonthlyProfit >= 0).length
      const unprofitable = t.subscribers.length - profitable
      console.log(`  │  Profitable: ${profitable}  |  Unprofitable: ${unprofitable}`)
      console.log(`  │`)

      // Show per-subscriber detail
      console.log(`  │  Per-subscriber breakdown:`)
      console.log(`  │  ${'Email'.padEnd(35)} ${'Wk Credits'.padStart(12)} ${'Util %'.padStart(8)} ${'Mo Profit'.padStart(12)}`)
      console.log(`  │  ${'─'.repeat(67)}`)
      for (const s of t.subscribers) {
        const icon = s.projectedMonthlyProfit >= 0 ? '✅' : '❌'
        const emailTrunc = s.email.length > 33 ? s.email.slice(0, 30) + '...' : s.email
        console.log(
          `  │  ${icon} ${emailTrunc.padEnd(33)} ${s.weeklyCredits.toLocaleString().padStart(12)} ${(s.utilization + '%').padStart(8)} ${('$' + s.projectedMonthlyProfit.toFixed(2)).padStart(12)}`,
        )
      }
      console.log(`  └${'─'.repeat(78)}\n`)
    }

    // Overall summary
    console.log(`${'═'.repeat(80)}`)
    console.log(`  OVERALL SUMMARY`)
    console.log(`${'═'.repeat(80)}\n`)

    const totalSubscribers = tierAnalyses.reduce((s, t) => s + t.subscriberCount, 0)
    const totalRevenue = tierAnalyses.reduce((s, t) => s + t.monthlyRevenue, 0)
    const totalProjectedCost = tierAnalyses.reduce((s, t) => {
      return s + t.subscribers.reduce(
        (sum, sub) => sum + (sub.weeklyCredits * WEEKS_PER_MONTH * COST_PER_CREDIT),
        0,
      )
    }, 0)
    const totalProfit = totalRevenue - totalProjectedCost
    const profitableCount = tierAnalyses.reduce(
      (s, t) => s + t.subscribers.filter((sub) => sub.projectedMonthlyProfit >= 0).length,
      0,
    )
    const unprofitableCount = totalSubscribers - profitableCount

    console.log(`  Total subscribers:     ${totalSubscribers}`)
    console.log(`  Total monthly revenue: $${totalRevenue.toLocaleString()}`)
    console.log(`  Total projected cost:  $${totalProjectedCost.toFixed(2)}`)
    console.log(`  ${totalProfit >= 0 ? '✅' : '❌'} Net projected profit:  $${totalProfit.toFixed(2)}/mo`)
    console.log(`  Profitable subscribers: ${profitableCount}/${totalSubscribers} (${((profitableCount / (totalSubscribers || 1)) * 100).toFixed(0)}%)`)
    console.log(`  Unprofitable subscribers: ${unprofitableCount}/${totalSubscribers}`)
    console.log(`  Avg profit margin: ${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%`)
    console.log()
  } catch (error) {
    console.error('Error analyzing subscriber profitability:', error)
  }
}

analyzeSubscriberProfitability()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error)
    process.exit(1)
  })
