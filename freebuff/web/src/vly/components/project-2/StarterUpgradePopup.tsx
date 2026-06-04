'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Sparkles, Clock, Zap } from 'lucide-react'
import { Button } from '@/vly/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/vly/components/ui/dialog'
import { useCustomer } from 'autumn-js/react'
import { getActivePlan } from '@/vly/lib/billing'
import { freePlan, starterPlan } from '@/vly/autumn.config'
import { useDirectPlanCheckout } from '@/vly/hooks/useDirectPlanCheckout'
import {
  PLAN_PRICES,
  ORIGINAL_PRICES,
  PLAN_BASE_CREDITS,
} from '@/vly/autumn/constants'

const FIRST_SEEN_KEY = 'starter_upgrade_popup_first_seen'
const DISMISSED_KEY = 'starter_upgrade_popup_dismissed'
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

interface StarterUpgradePopupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00'

  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((ms % (1000 * 60)) / 1000)

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function StarterUpgradePopup({
  open,
  onOpenChange,
}: StarterUpgradePopupProps) {
  const { directPlanCheckout, isDirectPlanCheckoutLoading } =
    useDirectPlanCheckout()
  const [timeRemaining, setTimeRemaining] =
    useState<number>(TWENTY_FOUR_HOURS_MS)

  // Initialize first seen timestamp and calculate time remaining
  useEffect(() => {
    if (typeof window === 'undefined') return

    let firstSeen = localStorage.getItem(FIRST_SEEN_KEY)
    if (!firstSeen) {
      firstSeen = Date.now().toString()
      localStorage.setItem(FIRST_SEEN_KEY, firstSeen)
    }

    const firstSeenTime = parseInt(firstSeen, 10)
    const endTime = firstSeenTime + TWENTY_FOUR_HOURS_MS

    const updateTimer = () => {
      const now = Date.now()
      const remaining = Math.max(0, endTime - now)
      setTimeRemaining(remaining)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [])

  const handleUpgrade = async () => {
    await directPlanCheckout({
      productId: starterPlan.id,
      productName: 'Starter Plan',
      isSubscriptionUpgrade: true,
    })
  }

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(DISMISSED_KEY, 'true')
    }
    onOpenChange(false)
  }

  const price = PLAN_PRICES.starter
  const originalPrice = ORIGINAL_PRICES.starter
  const dollarValue = Math.round(PLAN_BASE_CREDITS.starter / 1_000_000)

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleDismiss()
    } else {
      onOpenChange(newOpen)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-md overflow-y-auto border border-border bg-card p-0 shadow-lg"
        hideCloseButton
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-4 sm:p-5">
          <DialogHeader className="mb-3">
            <div className="flex items-center gap-2 pr-6">
              <div className="shrink-0 rounded-full bg-primary/10 p-1.5">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <DialogTitle className="text-base font-bold leading-tight text-foreground sm:text-lg">
                Expiring offer: early users only
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* Countdown Timer */}
          <div className="mb-3 rounded-lg border border-border bg-muted/40 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs font-medium text-foreground sm:text-sm">
                  Deal expires in:
                </span>
              </div>
              <div className="shrink-0 font-mono text-base font-semibold tabular-nums text-foreground sm:text-lg">
                {formatTimeRemaining(timeRemaining)}
              </div>
            </div>
          </div>

          {/* Offer Details */}
          <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="mb-2.5 flex items-start justify-between gap-3">
              <span className="text-base font-semibold text-foreground">
                Starter Plan
              </span>
              <div className="flex shrink-0 flex-col items-end">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground line-through">
                    ${originalPrice.toFixed(2)}
                  </span>
                  <span className="rounded bg-green-100 px-1 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    50% off
                  </span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-xl font-bold text-primary sm:text-2xl">
                    ${price}
                  </span>
                  <span className="text-xs text-muted-foreground">/mo</span>
                </div>
                <div className="text-[10px] font-medium text-muted-foreground">
                  Early user pricing
                </div>
                {dollarValue > 0 && (
                  <div className="text-xs font-medium text-green-600 dark:text-green-400">
                    ${dollarValue} in value
                  </div>
                )}
              </div>
            </div>

            <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 sm:text-sm">
              <li className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="truncate">4M agent credits/mo</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="truncate">Database Access</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="truncate">More projects & capacity</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="truncate">Custom domains</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="truncate">Docs visualizer</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="truncate">No Freebuff Web branding</span>
              </li>
            </ul>
          </div>

          {/* Urgency Message */}
          <p className="mb-3 text-center text-xs text-muted-foreground sm:text-sm">
            Congrats on being an early user!{' '}
            <span className="font-medium text-foreground">
              Lock in your rate now.
            </span>
          </p>

          {/* CTA Button */}
          <Button
            onClick={handleUpgrade}
            disabled={isDirectPlanCheckoutLoading}
            className="h-9 w-full"
          >
            {isDirectPlanCheckoutLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Upgrade to Starter — ${price}/mo
              </>
            )}
          </Button>

          {/* Skip link */}
          <button
            onClick={handleDismiss}
            className="mt-2 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Hook to determine if the starter upgrade popup should be shown
 * Shows for free tier users on every project page load (dismissal resets on unmount)
 */
export function useStarterUpgradePopup() {
  const { customer, isLoading } = useCustomer({
    errorOnNotFound: false,
  })
  const [isDismissed, setIsDismissed] = useState(false)

  const activeProducts = (customer?.products || []).filter(
    (product: any) =>
      product.status === 'active' ||
      (product as { scenario?: string }).scenario === 'active',
  )
  const hasActivePaidPlan = activeProducts.some(
    (product: any) => product.id !== freePlan.id,
  )
  const hasActiveFreePlan = activeProducts.some(
    (product: any) => product.id === freePlan.id,
  )

  // Derive during render - no effect needed.
  // Require confirmed customer+active-plan data so paid users are never treated as free.
  const { planId } = getActivePlan(
    customer?.products ?? [],
    customer,
    freePlan.id,
  )
  const isFreeTier =
    activeProducts.length > 0 &&
    !hasActivePaidPlan &&
    (hasActiveFreePlan || planId === freePlan.id || planId === 'free_plan')
  const showPopup = !isLoading && !!customer && isFreeTier && !isDismissed

  const setShowPopup = useCallback((open: boolean) => {
    setIsDismissed(!open)
  }, [])

  const closePopup = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(DISMISSED_KEY, 'true')
    }
    setIsDismissed(true)
  }, [])

  return {
    showPopup,
    setShowPopup,
    closePopup,
    isLoading,
  }
}
