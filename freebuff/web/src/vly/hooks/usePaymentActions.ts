/**
 * Custom hook for payment-related actions
 * Encapsulates setup, update, and upgrade payment logic
 */

import { useState } from 'react'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export interface UsePaymentActionsOptions {
  successUrl?: string
  onSuccess?: () => void
  onError?: (error: any) => void
}

export function usePaymentActions(options: UsePaymentActionsOptions = {}) {
  const router = useRouter()
  const setupPaymentAction = useAction(api.autumn.setupPayment)

  const [loadingStates, setLoadingStates] = useState({
    setup: false,
    update: false,
    upgrade: false,
  })

  const handleSetupPayment = async () => {
    setLoadingStates((prev) => ({ ...prev, setup: true }))
    try {
      const successUrl =
        options.successUrl ||
        `${window.location.origin}/web/dashboard?payment_setup=success`

      const result = await setupPaymentAction({ successUrl })

      if (result && !result.error && result.data?.url) {
        // Navigate to Stripe setup page
        window.location.href = result.data.url
      } else if (result?.error) {
        console.error('Setup payment error:', result.error)
        toast.error('Failed to setup payment method. Please try again.')
        options.onError?.(result.error)
      }
    } catch (error) {
      console.error('Setup payment error:', error)
      toast.error(
        'Unable to setup payment method. Please check your connection and try again.',
      )
      options.onError?.(error)
    } finally {
      setLoadingStates((prev) => ({ ...prev, setup: false }))
    }
  }

  const handleUpdatePaymentMethod = async () => {
    setLoadingStates((prev) => ({ ...prev, update: true }))
    try {
      const successUrl =
        options.successUrl ||
        `${window.location.origin}/web/dashboard?payment_updated=success`

      const result = await setupPaymentAction({ successUrl })

      if (result && !result.error && result.data?.url) {
        // Navigate to Stripe setup page
        window.location.href = result.data.url
      } else if (result?.error) {
        console.error('Update payment error:', result.error)
        toast.error('Failed to update payment method. Please try again.')
        options.onError?.(result.error)
      }
    } catch (error) {
      console.error('Update payment error:', error)
      toast.error(
        'Unable to update payment method. Please check your connection and try again.',
      )
      options.onError?.(error)
    } finally {
      setLoadingStates((prev) => ({ ...prev, update: false }))
    }
  }

  const handleQuickUpgrade = async (
    productId: string,
    checkout: (options: { productId: string; dialog: any }) => Promise<any>,
    checkoutDialog: any,
    onCheckoutResult?: (result: any) => void,
  ) => {
    setLoadingStates((prev) => ({ ...prev, upgrade: true }))
    console.log('[usePaymentActions] Starting quick upgrade:', { productId })

    try {
      const result = await checkout({
        productId,
        dialog: checkoutDialog,
      })

      console.log('[usePaymentActions] Checkout result:', result)

      if (result.data) {
        onCheckoutResult?.(result.data)
        options.onSuccess?.()
      } else if (result.error) {
        console.error(
          '[usePaymentActions] Checkout returned error:',
          result.error,
        )
        toast.error(
          `Upgrade failed: ${result.error.message || 'Unknown error'}`,
        )
        options.onError?.(result.error)
      }
    } catch (error: any) {
      console.error('[usePaymentActions] Quick upgrade error:', {
        error,
        message: error?.message,
        code: error?.code,
        data: error?.data,
        productId,
      })

      // Check if error contains a redirect URL (Stripe checkout)
      const redirectUrl =
        error?.url || error?.data?.url || (error as any)?.checkout_url
      if (redirectUrl) {
        console.log('[usePaymentActions] Redirecting to Stripe:', redirectUrl)
        window.location.href = redirectUrl
        return
      }

      const errorMessage =
        error?.message || error?.data?.message || 'Unknown error'
      toast.error(`Failed to start upgrade: ${errorMessage}. Please try again.`)
      options.onError?.(error)
    } finally {
      setLoadingStates((prev) => ({ ...prev, upgrade: false }))
    }
  }

  return {
    loadingStates,
    handleSetupPayment,
    handleUpdatePaymentMethod,
    handleQuickUpgrade,
  }
}
