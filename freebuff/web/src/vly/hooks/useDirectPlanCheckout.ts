'use client'

import { useState, useCallback, useRef } from 'react'
import { useCustomer } from '@/vly/lib/billing-disabled-react'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useConfetti } from '@/vly/hooks/use-confetti'
import { toast } from 'sonner'

const AGENT_CREDITS_FEATURE_ID = 'agent_credits'

export interface DirectPlanCheckoutParams {
  productId: string
  productName?: string
  successUrl?: string
  /** If true, skip bonus credits and fireUpgrade (e.g. one-off packs). Default false. */
  isSubscriptionUpgrade?: boolean
}

/**
 * One-click direct plan checkout: attach immediately, redirect to Stripe if
 * payment needed. No pricing popup. Grants bonus credits on success for
 * subscription upgrades when user had remaining credits.
 */
export function useDirectPlanCheckout() {
  const { attach, refetch, customer } = useCustomer()
  const { fireUpgrade } = useConfetti()
  const grantUpgradeBonusCredits = useAction(
    api.autumn.grantUpgradeBonusCredits,
  )
  const unpauseDeployments = useAction(
    api.deployment_management.unpauseCurrentUserDeployments,
  )
  const [isLoading, setIsLoading] = useState(false)
  const isProcessingRef = useRef(false)

  const directPlanCheckout = useCallback(
    async (params: DirectPlanCheckoutParams) => {
      const {
        productId,
        productName,
        successUrl,
        isSubscriptionUpgrade = true,
      } = params

      // Prevent concurrent calls - check ref synchronously
      if (isProcessingRef.current) {
        console.log(
          '[useDirectPlanCheckout] Checkout already in progress, ignoring duplicate call',
        )
        return
      }

      // Set both state and ref to prevent concurrent calls
      isProcessingRef.current = true
      setIsLoading(true)

      const currentBalance =
        (customer?.features as any)?.[AGENT_CREDITS_FEATURE_ID]?.balance ?? 0

      // Check if there's a cancelled subscription for recurring credit pack
      // If repurchasing after cancellation, we need to manually grant credits
      const isRecurringCreditPack = productId === 'recurring_credit_pack'
      const hasCancelledRecurringPack =
        isRecurringCreditPack &&
        (customer?.products || []).some(
          (product: any) =>
            product.id === 'recurring_credit_pack' &&
            product.canceled_at &&
            (product.status === 'active' || product.scenario === 'active'),
        )

      // Special handling for Starter plan - always redirect to show acknowledgment dialog
      const isStarterUpgrade = productId === 'starter_plan'
      const finalSuccessUrl =
        successUrl ||
        (isStarterUpgrade
          ? `${typeof window !== 'undefined' ? window.location.origin : ''}/web/dashboard?upgraded=starter`
          : `${typeof window !== 'undefined' ? window.location.origin : ''}/web/dashboard`)

      try {
        await attach({
          productId,
          successUrl: finalSuccessUrl,
        })

        // If repurchasing a cancelled recurring credit pack, manually grant the credits
        // because attach might reactivate the cancelled subscription without granting credits again
        if (hasCancelledRecurringPack) {
          const RECURRING_PACK_CREDITS = 15000000 // 15M credits
          try {
            const grantResult = await grantUpgradeBonusCredits({
              featureId: AGENT_CREDITS_FEATURE_ID,
              amount: RECURRING_PACK_CREDITS,
              reason: `Credits granted for repurchased recurring credit pack`,
            })
            if (grantResult.success) {
              console.log(
                `[useDirectPlanCheckout] Granted ${RECURRING_PACK_CREDITS} credits for repurchased recurring pack`,
              )
            } else {
              console.error(
                '[useDirectPlanCheckout] Failed to grant credits for repurchased pack:',
                grantResult.error,
              )
            }
          } catch (grantError) {
            console.error(
              '[useDirectPlanCheckout] Error granting credits for repurchased pack:',
              grantError,
            )
          }
        }

        if (isSubscriptionUpgrade && currentBalance > 0) {
          try {
            const bonusResult = await grantUpgradeBonusCredits({
              featureId: AGENT_CREDITS_FEATURE_ID,
              amount: currentBalance,
              reason: `Credits preserved from previous plan (upgrade to ${productName ?? productId})`,
            })
            if (bonusResult.success) {
              console.log(
                `[useDirectPlanCheckout] Granted ${currentBalance} bonus credits from previous plan`,
              )
            } else {
              console.error(
                '[useDirectPlanCheckout] Failed to grant bonus credits:',
                bonusResult.error,
              )
            }
          } catch (bonusError) {
            console.error(
              '[useDirectPlanCheckout] Error granting bonus credits:',
              bonusError,
            )
          }
        }

        if (isSubscriptionUpgrade) {
          fireUpgrade()
        }

        try {
          await refetch()
        } catch (e) {
          console.error('[useDirectPlanCheckout] Refetch error:', e)
        }

        try {
          const unpauseResult = await unpauseDeployments()
          if (unpauseResult?.unpaused && unpauseResult?.success) {
            toast.success(
              `Deployments unpaused! Restarting ${unpauseResult.successCount} deployment${unpauseResult.successCount !== 1 ? 's' : ''}...`,
            )
          }
        } catch (e) {
          console.error('[useDirectPlanCheckout] Unpause error:', e)
        }

        if (isSubscriptionUpgrade) {
          toast.success(
            productName
              ? `Successfully subscribed to ${productName}!`
              : 'Successfully subscribed!',
          )
        } else {
          toast.success(
            productName
              ? `Successfully purchased ${productName}!`
              : 'Purchase successful!',
          )
        }

        // For Starter upgrades, redirect to billing page with query param to show dialog
        if (isStarterUpgrade && typeof window !== 'undefined') {
          window.location.href = finalSuccessUrl
          return
        }
      } catch (error: any) {
        const redirectUrl =
          error?.url ||
          error?.data?.url ||
          (error?.response?.data as any)?.url ||
          (error as any)?.checkout_url
        if (redirectUrl) {
          window.location.href = redirectUrl
          return
        }
        const msg = error?.message || error?.data?.message || 'Checkout failed'
        toast.error(msg)
        throw error
      } finally {
        isProcessingRef.current = false
        setIsLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      attach,
      customer?.features,
      grantUpgradeBonusCredits,
      unpauseDeployments,
      refetch,
      fireUpgrade,
    ],
  )

  return { directPlanCheckout, isDirectPlanCheckoutLoading: isLoading }
}
