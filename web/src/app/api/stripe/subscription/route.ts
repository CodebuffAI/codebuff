import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { stripeServer } from 'common/src/util/stripe'
import { authOptions } from '../../auth/[...nextauth]/auth-options'
import { env } from '@/env.mjs'
import {
  PLAN_CONFIGS,
  BILLING_PERIOD_DAYS,
  CREDITS_USAGE_LIMITS,
  OVERAGE_RATE_PRO,
  OVERAGE_RATE_MOAR_PRO,
} from 'common/constants'
import { AuthenticatedQuotaManager } from 'common/billing/quota-manager'
import type Stripe from 'stripe'
import { PlanName, SubscriptionPreviewResponse } from 'common/src/types/plan'
import { getTotalReferralCreditsForCustomer } from '@/lib/stripe-utils'

type PlanPriceIds = {
  priceId: string
  overagePriceId: string
}

function getSubscriptionItemByType(
  subscription: Stripe.Subscription,
  usageType: 'licensed' | 'metered'
) {
  return subscription.items.data.find(
    (item) => item.price.recurring?.usage_type === usageType
  )
}

function getPlanPriceIds(targetPlan: string): PlanPriceIds {
  return {
    priceId:
      targetPlan === 'Pro'
        ? env.STRIPE_PRO_PRICE_ID
        : env.STRIPE_MOAR_PRO_PRICE_ID,
    overagePriceId:
      targetPlan === 'Pro'
        ? env.STRIPE_PRO_OVERAGE_PRICE_ID
        : env.STRIPE_MOAR_PRO_OVERAGE_PRICE_ID,
  }
}

async function validatePlanChange(
  targetPlan: string | null,
  customerId: string
) {
  if (!targetPlan) {
    return {
      error: {
        code: 'invalid-plan',
        message: 'Target plan is required',
      },
      status: 400,
    }
  }

  const planConfig = Object.values(PLAN_CONFIGS).find(
    (config) => config.displayName === targetPlan
  )
  if (!planConfig || !planConfig.monthlyPrice) {
    return {
      error: {
        code: 'invalid-plan',
        message: 'Invalid target plan',
      },
      status: 400,
    }
  }

  const currentSubscription = await getCurrentSubscription(customerId)
  if (currentSubscription) {
    const { priceId, overagePriceId } = getPlanPriceIds(targetPlan as string)
    const licensedItem = getSubscriptionItemByType(
      currentSubscription,
      'licensed'
    )
    const meteredItem = getSubscriptionItemByType(
      currentSubscription,
      'metered'
    )

    if (!licensedItem || !meteredItem) {
      throw new Error('Missing required subscription items')
    }

    if (
      licensedItem.price.id === priceId &&
      meteredItem.price.id === overagePriceId
    ) {
      return {
        error: {
          code: 'invalid-upgrade',
          message: 'You are already subscribed to this plan.',
        },
        status: 400,
      }
    }
  }

  return { planConfig }
}

async function getCurrentSubscription(customerId: string) {
  const subscriptions = await stripeServer.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  })
  return subscriptions.data[0]
}

async function checkForUnpaidInvoices(customerId: string) {
  const unpaidInvoices = await stripeServer.invoices.list({
    customer: customerId,
    status: 'open',
  })

  if (unpaidInvoices.data.length > 0) {
    return {
      error: {
        message:
          'You have unpaid invoices. Please check your email or contact support.',
      },
      status: 400,
    }
  }
}

export const GET = async (request: Request) => {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'no-access', message: 'You are not signed in.' } },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const targetPlan = searchParams.get('targetPlan')

  const validationResult = await validatePlanChange(
    targetPlan,
    session.user.stripe_customer_id
  )
  if ('error' in validationResult) {
    return NextResponse.json(validationResult.error, {
      status: validationResult.status,
    })
  }
  const { planConfig } = validationResult
  if (!planConfig.monthlyPrice) {
    return NextResponse.json(
      {
        error: {
          code: 'invalid-plan',
          message: 'Invalid target plan',
        },
      },
      { status: 400 }
    )
  }

  try {
    const currentSubscription = await getCurrentSubscription(
      session.user.stripe_customer_id
    )
    const { priceId, overagePriceId } = getPlanPriceIds(targetPlan as string)

    if (currentSubscription) {
      const licensedItem = getSubscriptionItemByType(
        currentSubscription,
        'licensed'
      )
      const meteredItem = getSubscriptionItemByType(
        currentSubscription,
        'metered'
      )

      if (!licensedItem) {
        throw new Error('No licensed subscription item found')
      }

      if (!meteredItem) {
        throw new Error('No metered subscription item found')
      }

      const items = [
        {
          id: licensedItem.id,
          price: priceId,
        },
        {
          id: meteredItem.id,
          price: overagePriceId,
        },
      ]

      const preview = await stripeServer.invoices.retrieveUpcoming({
        customer: session.user.stripe_customer_id,
        subscription: currentSubscription.id,
        subscription_items: items,
        subscription_proration_date: Math.floor(new Date().getTime() / 1000),
      })

      // Get current usage, quota, and referral credits
      const quotaManager = new AuthenticatedQuotaManager()
      const { creditsUsed, quota: baseQuota } = await quotaManager.checkQuota(
        session.user.id
      )

      // Add referral credits to quota
      const referralCredits = await getTotalReferralCreditsForCustomer(
        session.user.stripe_customer_id
      )
      const totalQuota = baseQuota + referralCredits

      // Get the new plan's credit limit
      const newPlanLimit =
        CREDITS_USAGE_LIMITS[targetPlan === 'Pro' ? 'PRO' : 'MOAR_PRO']

      // Calculate current overage based on current quota
      const currentOverageCredits = Math.max(0, creditsUsed - totalQuota)

      // Calculate new overage based on new plan's quota
      const newOverageCredits = Math.max(0, creditsUsed - newPlanLimit)

      // Get current overage rate from subscription's metered price
      const currentMeteredItem = getSubscriptionItemByType(
        currentSubscription,
        'metered'
      )
      if (!currentMeteredItem) {
        throw new Error('No metered subscription item found')
      }
      const currentOverageRate =
        currentMeteredItem.price.id === env.STRIPE_PRO_OVERAGE_PRICE_ID
          ? OVERAGE_RATE_PRO
          : OVERAGE_RATE_MOAR_PRO
      const newOverageRate =
        targetPlan === 'Pro' ? OVERAGE_RATE_PRO : OVERAGE_RATE_MOAR_PRO

      // Calculate overage amounts using respective credits and rates
      const currentOverageAmount =
        Math.ceil(currentOverageCredits / 100) * currentOverageRate
      const newOverageAmount =
        Math.ceil(newOverageCredits / 100) * newOverageRate

      const previewResponse: SubscriptionPreviewResponse = {
        currentMonthlyRate: licensedItem.price.unit_amount
          ? licensedItem.price.unit_amount / 100
          : 0,
        newMonthlyRate: planConfig.monthlyPrice,
        currentQuota: totalQuota,
        daysRemainingInBillingPeriod: Math.ceil(
          (currentSubscription.current_period_end -
            Math.floor(new Date().getTime() / 1000)) /
            (24 * 60 * 60)
        ),
        prorationDate: currentSubscription.current_period_end,
        overageCredits: currentOverageCredits,
        currentOverageRate,
        newOverageRate,
        newOverageAmount,
        currentOverageAmount,
        lineItems: preview.lines.data
          .filter((d) => d.proration)
          .map((line) => ({
            amount: line.amount / 100, // Convert to dollars
            description: line.description || '',
            period: line.period,
            proration: line.proration,
          })),
      }

      return NextResponse.json(previewResponse)
    } else {
      // New subscription - no proration needed
      // For new subscriptions, no proration needed
      const startDate = Math.floor(Date.now() / 1000)
      const endDate =
        Math.floor(new Date().getTime() / 1000) +
        BILLING_PERIOD_DAYS * 24 * 60 * 60

      const response = {
        currentMonthlyRate: 0,
        newMonthlyRate: planConfig.monthlyPrice,
        daysRemainingInBillingPeriod: BILLING_PERIOD_DAYS,
        prorationAmount: planConfig.monthlyPrice,
        prorationDate: endDate,
      }

      console.log('Sending subscription preview response:', response)
      return NextResponse.json(response)
    }
  } catch (error: any) {
    console.error('Error fetching subscription preview:', error)
    return NextResponse.json(
      {
        error: {
          code: error.code || 'stripe-error',
          message: error.message || 'Failed to fetch subscription preview',
        },
      },
      { status: error.statusCode || 500 }
    )
  }
}

export const POST = async (request: Request) => {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json(
      { error: { message: 'You are not signed in.' } },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const targetPlan = body.targetPlan as PlanName

    const validationResult = await validatePlanChange(
      targetPlan,
      session.user.stripe_customer_id
    )
    if ('error' in validationResult) {
      return NextResponse.json(validationResult.error, {
        status: validationResult.status,
      })
    }

    const unpaidInvoicesResult = await checkForUnpaidInvoices(
      session.user.stripe_customer_id
    )
    if (unpaidInvoicesResult) {
      return NextResponse.json(unpaidInvoicesResult.error, {
        status: unpaidInvoicesResult.status,
      })
    }

    const currentSubscription = await getCurrentSubscription(
      session.user.stripe_customer_id
    )
    if (!currentSubscription) {
      return NextResponse.json(
        { error: { message: 'No active subscription found' } },
        { status: 400 }
      )
    }

    console.log('Starting subscription update to', targetPlan)

    // Get total usage under current plan before making any changes
    const licensedItem = getSubscriptionItemByType(
      currentSubscription,
      'licensed'
    )
    console.log('Fetching current metered usage...')
    const meteredItem = getSubscriptionItemByType(
      currentSubscription,
      'metered'
    )
    if (!licensedItem || !meteredItem) {
      throw new Error('No metered subscription item found')
    }

    const usage = await stripeServer.subscriptionItems.listUsageRecordSummaries(
      meteredItem.id
    )

    const totalUsage = usage.data.reduce(
      (sum, record) => sum + record.total_usage,
      0
    )
    console.log('Current total usage:', totalUsage)

    const { priceId, overagePriceId } = getPlanPriceIds(targetPlan)

    console.log('Updating subscription items...')
    // Update subscription items
    const updatedSubscription = await stripeServer.subscriptions.update(
      currentSubscription.id,
      {
        items: [
          {
            id: licensedItem.id,
            price: priceId,
          },
          {
            id: meteredItem.id,
            price: overagePriceId,
          },
        ],
        proration_behavior: 'always_invoice',
      }
    )

    console.log('Subscription updated successfully')

    // Record the usage under the new plan
    if (totalUsage > 0) {
      console.log('Recording existing usage under new plan...')
      const newMeteredItem = getSubscriptionItemByType(
        updatedSubscription,
        'metered'
      )
      if (!newMeteredItem) {
        throw new Error(
          'No metered subscription item found in updated subscription'
        )
      }

      console.log('Creating usage record for', totalUsage, 'credits')
      await stripeServer.subscriptionItems.createUsageRecord(
        newMeteredItem.id,
        {
          quantity: totalUsage,
          timestamp: Math.floor(new Date().getTime() / 1000),
          action: 'increment',
        }
      )
      console.log('Usage record created successfully')
    }

    console.log('Subscription change completed successfully')
    return NextResponse.json({
      subscription: updatedSubscription,
      migratedUsage: totalUsage,
    })
  } catch (error: any) {
    console.error('Error updating subscription:', {
      error,
      code: error.code,
      message: error.message,
      type: error.type,
      statusCode: error.statusCode,
    })
    return NextResponse.json(
      {
        error: {
          code: error.code || 'stripe-error',
          message: error.message || 'Failed to update subscription',
        },
      },
      { status: error.statusCode || 500 }
    )
  }
}
