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
import { SubscriptionPreviewResponse } from 'common/src/types/plan'
import { UsageLimits } from 'common/constants'
import { getTotalReferralCreditsForCustomer } from '@/lib/stripe-utils'
import { match, P } from 'ts-pattern'
import { changeOrUpgrade } from '@/lib/utils'

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

function getPlanPriceIds(targetPlan: string): PlanPriceIds | null {
  return match(targetPlan)
    .with(UsageLimits.PRO, () => ({
      priceId: env.STRIPE_PRO_PRICE_ID,
      overagePriceId: env.STRIPE_PRO_OVERAGE_PRICE_ID,
    }))
    .with(UsageLimits.MOAR_PRO, () => ({
      priceId: env.STRIPE_MOAR_PRO_PRICE_ID,
      overagePriceId: env.STRIPE_MOAR_PRO_OVERAGE_PRICE_ID,
    }))
    .otherwise(() => null)
}

async function validatePlanChange(
  targetPlan: UsageLimits | null,
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

  const planConfig = PLAN_CONFIGS[targetPlan]
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
    // Check subscription status
    if (currentSubscription.status !== 'active') {
      return {
        error: {
          code: 'invalid-subscription-state',
          message: match(currentSubscription.status)
            .with(
              'past_due',
              () =>
                'Your subscription has past due payments. Please update your payment method.'
            )
            .with(
              'canceled',
              () =>
                'Your subscription has been canceled. Please reactivate your subscription first.'
            )
            .with(
              'incomplete',
              () =>
                'Your subscription setup is incomplete. Please complete the setup first.'
            )
            .with(
              'incomplete_expired',
              () =>
                'Your previous subscription attempt expired. Please try again.'
            )
            .otherwise(
              () => 'Your subscription is not in an active state for upgrades.'
            ),
        },
        status: 400,
      }
    }

    // Check for trial periods
    if (currentSubscription.trial_end) {
      const trialEnd = new Date(currentSubscription.trial_end * 1000)
      if (trialEnd > new Date()) {
        return {
          error: {
            code: 'trial-active',
            message:
              'Please wait until your trial period ends before changing plans.',
          },
          status: 400,
        }
      }
    }

    const priceIds = getPlanPriceIds(targetPlan as string)
    if (!priceIds) {
      return {
        error: {
          code: 'invalid-plan',
          message: 'Invalid target plan',
        },
        status: 400,
      }
    }
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

    const { overagePriceId, priceId } = priceIds
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
  const details = searchParams.get('details')
  const user = session.user

  return match({
    targetPlan,
    details,
  })
    .with({ details: 'basic' }, async () => {
      try {
        const subscription = await getCurrentSubscription(
          user.stripe_customer_id
        )
        const basePriceItem = subscription?.items.data.find(
          (item) => item.price.recurring?.usage_type === 'licensed'
        )

        let currentPlan: UsageLimits | null = null
        if (basePriceItem?.price.id === env.STRIPE_PRO_PRICE_ID) {
          currentPlan = UsageLimits.PRO
        } else if (basePriceItem?.price.id === env.STRIPE_MOAR_PRO_PRICE_ID) {
          currentPlan = UsageLimits.MOAR_PRO
        }

        return NextResponse.json({ currentPlan })
      } catch (error) {
        console.error('Error fetching subscription:', error)
        return NextResponse.json(
          {
            error: {
              code: 'stripe-error',
              message: 'Failed to fetch subscription details',
            },
          },
          { status: 500 }
        )
      }
    })
    .with(
      { details: 'full', targetPlan: P.string },
      { details: P.nullish, targetPlan: P.string },
      async ({ targetPlan }) => {
        const validationResult = await validatePlanChange(
          targetPlan as UsageLimits,
          user.stripe_customer_id
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
            user.stripe_customer_id
          )
          const priceIds = getPlanPriceIds(targetPlan)
          if (!priceIds) {
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
          const { priceId, overagePriceId } = priceIds

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
              customer: user.stripe_customer_id,
              subscription: currentSubscription.id,
              subscription_items: items,
              subscription_proration_date: Math.floor(
                new Date().getTime() / 1000
              ),
            })

            // Get current usage, quota, and referral credits
            const quotaManager = new AuthenticatedQuotaManager()
            const { creditsUsed, quota: baseQuota } =
              await quotaManager.checkQuota(user.id ?? '')

            // Add referral credits to quota
            const referralCredits = await getTotalReferralCreditsForCustomer(
              user.stripe_customer_id
            )
            const totalQuota = baseQuota + referralCredits

            // Calculate overage based on current quota
            const overageCredits = Math.max(0, creditsUsed - totalQuota)

            // Get the new plan's credit limit
            const newPlanLimit = CREDITS_USAGE_LIMITS[targetPlan as UsageLimits]

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
            const newOverageRate = planConfig.overageRate || 0

            // Calculate overage amo–unts using respective credits and rates
            const currentOverageAmount =
              (overageCredits / 100) * currentOverageRate
            const newOverageAmount = (newOverageCredits / 100) * newOverageRate

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
              overageCredits,
              newOverageCredits,
              creditsUsed,
              currentOverageRate,
              newOverageRate,
              newOverageAmount,
              currentOverageAmount,
              lineItems: preview.lines.data
                .filter((d) => d.proration)
                .map((line) => ({
                  amount: line.amount / 100,
                  description: line.description || '',
                  period: line.period,
                  proration: line.proration,
                })),
            }

            return NextResponse.json(previewResponse)
          } else {
            // New subscription - no proration needed
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

            return NextResponse.json(response)
          }
        } catch (error: any) {
          console.error('Error fetching subscription preview:', error)
          return NextResponse.json(
            {
              error: {
                code: error.code || 'stripe-error',
                message:
                  error.message || 'Failed to fetch subscription preview',
              },
            },
            { status: error.statusCode || 500 }
          )
        }
      }
    )
    .with({ details: P.string }, () => {
      return NextResponse.json(
        {
          error: {
            code: 'invalid-plan',
            message: 'details query parameter can only be "basic" or "full"',
          },
        },
        { status: 400 }
      )
    })
    .with({ targetPlan: P.nullish }, { targetPlan: P.string }, () => {
      return NextResponse.json(
        {
          error: {
            code: 'invalid-plan',
            message: 'target plan query parameter is invalid',
          },
        },
        { status: 400 }
      )
    })
    .exhaustive()
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
    const planParam = body.targetPlan as string
    const targetPlan =
      planParam === 'Pro'
        ? UsageLimits.PRO
        : planParam === 'Moar Pro'
          ? UsageLimits.MOAR_PRO
          : UsageLimits.FREE

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

    const priceIds = getPlanPriceIds(targetPlan)
    if (!priceIds) {
      return NextResponse.json(
        { error: { message: 'Invalid target plan' } },
        { status: 400 }
      )
    }
    const { priceId, overagePriceId } = priceIds
    const licensedItem = getSubscriptionItemByType(
      currentSubscription,
      'licensed'
    )
    const meteredItem = getSubscriptionItemByType(
      currentSubscription,
      'metered'
    )

    if (!licensedItem || !meteredItem) {
      throw new Error('No metered subscription item found')
    }

    // Determine if this is a downgrade by comparing plan prices
    const currentPlanName =
      currentSubscription.items.data.find(
        (item) => item.price.recurring?.usage_type === 'licensed'
      )?.price.id === env.STRIPE_PRO_PRICE_ID
        ? UsageLimits.PRO
        : UsageLimits.MOAR_PRO

    const isDowngrade =
      changeOrUpgrade(currentPlanName, targetPlan) === 'change'

    console.log(`${isDowngrade ? 'Downgrade' : 'Upgrade'} to ${targetPlan}...`)
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
        proration_behavior: 'create_prorations',
      }
    )

    console.log('Subscription updated successfully')

    // Record the usage under the new plan
    const quotaManager = new AuthenticatedQuotaManager()
    const { creditsUsed: totalUsage } = await quotaManager.checkQuota(
      session.user.id
    )
    console.log('Current total usage:', totalUsage)
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

      try {
        await stripeServer.billing.meterEvents.create({
          event_name: 'credits',
          timestamp: Math.floor(new Date().getTime() / 1000),
          payload: {
            stripe_customer_id: session.user.stripe_customer_id,
            value: totalUsage.toString(),
          },
        })
        console.log('Usage record created successfully')
      } catch (error) {
        // Log detailed error context for manual investigation
        console.error('Failed to record usage:', {
          // User context
          userId: session.user.id,
          customerId: session.user.stripe_customer_id,

          // Subscription context
          subscriptionId: updatedSubscription.id,
          oldPlanPriceId: licensedItem.price.id,
          newPlanPriceId: priceId,

          // Usage context
          totalUsage,
          timestamp: new Date().toISOString(),
          billingPeriodStart: new Date(
            updatedSubscription.current_period_start * 1000
          ).toISOString(),
          billingPeriodEnd: new Date(
            updatedSubscription.current_period_end * 1000
          ).toISOString(),

          // Error details
          error: {
            message: error instanceof Error ? error.message : String(error),
            type:
              error instanceof Error ? error.constructor.name : typeof error,
            raw: error,
          },
        })

        throw new Error(
          'Failed to record usage. Our team has been notified and will ensure your usage is properly recorded. Please reach out to support at ' +
            env.NEXT_PUBLIC_SUPPORT_EMAIL +
            ' if you have any concerns.'
        )
      }
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
