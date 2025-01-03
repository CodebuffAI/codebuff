import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { match, P } from 'ts-pattern'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { env } from '@/env.mjs'
import {
  BILLING_PERIOD_DAYS,
  CREDITS_USAGE_LIMITS,
  OVERAGE_RATE_PRO,
  OVERAGE_RATE_MOAR_PRO,
} from 'common/constants'
import { stripeServer } from 'common/src/util/stripe'
import { AuthenticatedQuotaManager } from 'common/billing/quota-manager'
import { SubscriptionPreviewResponse } from 'common/src/types/plan'
import { UsageLimits } from 'common/constants'
import {
  checkForUnpaidInvoices,
  getCurrentSubscription,
  getPlanPriceIds,
  getSubscriptionItemByType,
  getTotalReferralCreditsForCustomer,
  validatePlanChange,
} from '@/lib/stripe-utils'
import { changeOrUpgrade } from '@/lib/utils'

export const GET = async (request: Request) => {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'no-access', message: 'You are not signed in.' } },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const targetPlanParam = searchParams.get('targetPlan')

  const user = session.user

  if (!targetPlanParam) {
    return NextResponse.json(
      {
        error: {
          code: 'invalid-plan',
          message: 'Target plan is required',
        },
      },
      { status: 400 }
    )
  }
  const validationResult = await validatePlanChange(
    targetPlanParam as UsageLimits,
    user.stripe_customer_id
  )
  if ('error' in validationResult) {
    return NextResponse.json(validationResult.error, {
      status: validationResult.status,
    })
  }
  const { planConfig } = validationResult
  const referralCredits = await getTotalReferralCreditsForCustomer(
    user.stripe_customer_id
  )
  // Get current usage, quota, and referral credits
  const quotaManager = new AuthenticatedQuotaManager()
  const { creditsUsed, quota: baseQuota } = await quotaManager.checkQuota(
    user.id
  )
  const totalQuota = baseQuota + referralCredits
  return match(targetPlanParam)
    .with(P.string, async (targetPlan) => {
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

        // Get the new plan's credit limit
        const newPlanLimit = CREDITS_USAGE_LIMITS[targetPlan as UsageLimits]

        // Calculate new overage based on new plan's quota
        const newOverageCredits = Math.max(0, creditsUsed - newPlanLimit)
        const newOverageRate = planConfig.overageRate || 0
        const newOverageAmount = (newOverageCredits / 100) * newOverageRate

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

          // Calculate overage based on current quota
          const overageCredits = Math.max(0, creditsUsed - totalQuota)

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

          // Calculate overage amounts using respective credits and rates
          const currentOverageAmount =
            (overageCredits / 100) * currentOverageRate

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

          const response: SubscriptionPreviewResponse = {
            currentMonthlyRate: 0,
            newMonthlyRate: planConfig.monthlyPrice,
            currentQuota: totalQuota,
            creditsUsed,
            currentOverageRate: 0,

            newOverageRate: planConfig.overageRate || 0,
            newOverageAmount,
            lineItems: [], // hmmm
            overageCredits: 0,
            newOverageCredits,
            currentOverageAmount: 0,

            daysRemainingInBillingPeriod: BILLING_PERIOD_DAYS,
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
              message: error.message || 'Failed to fetch subscription preview',
            },
          },
          { status: error.statusCode || 500 }
        )
      }
    })
    .with(P.nullish, () => {
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
    const targetPlan = body.targetPlan as UsageLimits

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

    const { searchParams } = new URL(request.url)
    if (!currentSubscription) {
      const priceId =
        targetPlan === UsageLimits.PRO
          ? env.STRIPE_PRO_PRICE_ID
          : env.STRIPE_MOAR_PRO_PRICE_ID
      const overagePriceId =
        targetPlan === UsageLimits.PRO
          ? env.STRIPE_PRO_OVERAGE_PRICE_ID
          : env.STRIPE_MOAR_PRO_OVERAGE_PRICE_ID

      const checkoutSession = await stripeServer.checkout.sessions.create({
        mode: 'subscription',
        customer: session.user.stripe_customer_id,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
          {
            price: overagePriceId,
          },
        ],
        success_url: `${env.NEXT_PUBLIC_APP_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&${searchParams}`,
        cancel_url: `${env.NEXT_PUBLIC_APP_URL}?${searchParams}`,
        allow_promotion_codes: true,
      })

      return NextResponse.json({ session: checkoutSession }, { status: 200 })
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
