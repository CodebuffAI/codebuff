'use client'

import { useState, useRef } from 'react'
import {
  AlertTriangle,
  Coins,
  CreditCard,
  ArrowRight,
  Plus,
  RefreshCw,
  Zap,
} from 'lucide-react'
import { Button } from '@/vly/components/ui/button'
import { useCreditsBalance } from '@/vly/hooks/useCreditCheck'
import { useRouter } from 'next/navigation'
import { useCustomer } from 'autumn-js/react'
import { getActivePlan } from '@/vly/lib/billing'

import {
  freePlan,
  starterPlan,
  hobbyPlan,
  businessPlan,
  scalePlan,
  priorityPlan,
  ultraPlan,
  maxPlan,
  unlimitedPlan,
  oneTimeCreditPack,
  recurringCreditPack,
} from '@/vly/autumn.config'
import { UpgradePrompt } from '@/vly/components/billing/FeatureGate'
import { useDirectPlanCheckout } from '@/vly/hooks/useDirectPlanCheckout'
import { PLAN_BASE_CREDITS, type TierName } from '@/vly/autumn/constants'
import {
  formatCredits,
  getNextTier,
  getFormattedPriceWithPeriod,
} from '@/vly/autumn/helpers'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/vly/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/vly/components/ui/dialog'
import { toast } from 'sonner'

// Credit pack options - one-time and recurring
const CREDIT_PACK_OPTIONS = {
  oneTime: {
    product: oneTimeCreditPack,
    label: 'One-Time Pack',
    amount: '15M credits',
    price: '$15',
    description: 'Pay once, no commitment',
  },
  recurring: {
    product: recurringCreditPack,
    label: 'Monthly Pack',
    amount: '15M credits/mo',
    price: '$12/mo',
    description: 'Better value, cancel anytime',
  },
}

// Map plan IDs to tier names
const PLAN_ID_TO_TIER: Record<string, TierName> = {
  free_plan: 'free',
  starter_plan: 'starter',
  hobby_plan: 'hobby',
  business_plan: 'business',
  scale_plan: 'scale',
  priority_plan: 'priority',
  ultra_plan: 'ultra',
  max_plan: 'max',
  unlimited_plan: 'unlimited',
  enterprise_plan: 'enterprise',
  // Legacy mappings
  hobby_custom_plan: 'hobby',
  pro_custom_plan: 'business',
  pro_plan: 'business',
  team_plan: 'scale',
  team_custom_plan: 'scale',
}

// Map tier names to plan objects (used for plan lookups)
// Tier to plan mapping kept for reference
const _TIER_TO_PLAN: Record<TierName, any> = {
  free: freePlan,
  starter: starterPlan,
  hobby: hobbyPlan,
  business: businessPlan,
  scale: scalePlan,
  priority: priorityPlan,
  ultra: ultraPlan,
  max: maxPlan,
  unlimited: unlimitedPlan,
  enterprise: unlimitedPlan, // Use unlimited as fallback for enterprise
}

interface CreditOverlayProps {
  onUpgradeClick?: () => void
  showUpgradeButton?: boolean
  reason?: string
}

export function CreditOverlay({
  onUpgradeClick,
  showUpgradeButton = true,
}: CreditOverlayProps) {
  const { creditsRemaining, totalCredits, planName, isLoading } =
    useCreditsBalance()
  const { customer, refetch } = useCustomer()
  const { directPlanCheckout } = useDirectPlanCheckout()
  const router = useRouter()
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null)
  const isPurchasingRef = useRef<string | null>(null)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false)

  // Get current tier from plan ID
  const getCurrentTier = (): TierName => {
    if (!customer?.products) return 'free'
    const { planId } = getActivePlan(customer.products, customer, freePlan.id)
    return PLAN_ID_TO_TIER[planId] || 'free'
  }

  const currentTier = getCurrentTier()
  const nextTierDef = getNextTier(currentTier)
  const isOnFreePlan = currentTier === 'free'

  const handleUpgradeClick = () => {
    if (onUpgradeClick) {
      onUpgradeClick()
    } else {
      // Navigate to billing page
      router.push('/web/dashboard')
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-amber-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-amber-200" />
            <div className="bg-amber-150 h-3 w-64 animate-pulse rounded" />
          </div>
        </div>
      </div>
    )
  }

  // Open upgrade dialog to show full paywall before confirming
  const handleOpenUpgradeDialog = () => {
    setIsUpgradeDialogOpen(true)
  }

  // Handle credit pack purchase - works for both one-time and recurring
  const handleBuyPack = async (productId: string, isRecurring: boolean) => {
    // Prevent concurrent purchases - check ref synchronously
    if (isPurchasingRef.current !== null) {
      console.log(
        `[CreditOverlay] Purchase already in progress: ${isPurchasingRef.current}`,
      )
      return
    }

    // Set both state and ref to prevent concurrent calls
    isPurchasingRef.current = productId
    setIsPurchasing(productId)
    // Keep popover open to show loading state on the button

    const packType = isRecurring ? 'recurring' : 'one-time'
    console.log(`[CreditOverlay] Starting ${packType} credit pack purchase:`, {
      productId,
      currentTier,
      customerId: customer?.id,
    })

    try {
      await directPlanCheckout({
        productId,
        productName: isRecurring
          ? 'Monthly Credit Pack'
          : 'One-Time Credit Pack',
        isSubscriptionUpgrade: false, // Credit packs don't get bonus credits
      })
      console.log(`[CreditOverlay] ${packType} credit pack purchase successful`)
      toast.success(
        isRecurring
          ? 'Monthly credits activated! You can manage this from billing.'
          : 'Credits purchased successfully!',
      )
      setIsPopoverOpen(false) // Close popover on success
      await refetch()
    } catch (error: any) {
      console.error(`[CreditOverlay] ${packType} pack purchase error:`, {
        error,
        message: error?.message,
        code: error?.code,
        data: error?.data,
        productId,
      })
      const redirectUrl =
        error?.url || error?.data?.url || (error as any)?.checkout_url
      if (redirectUrl) {
        console.log('[CreditOverlay] Redirecting to Stripe:', redirectUrl)
        window.location.href = redirectUrl
        return
      }
      const errorMessage =
        error?.message ||
        error?.data?.message ||
        'Failed to purchase credits. Please try again.'
      toast.error(errorMessage)
      setIsPopoverOpen(false) // Close popover on error
    } finally {
      isPurchasingRef.current = null
      setIsPurchasing(null)
    }
  }

  // Determine target tier for dialog - support all tiers including hidden ones
  const validTiers: (
    | 'Starter'
    | 'Hobby'
    | 'Business'
    | 'Scale'
    | 'Priority'
    | 'Ultra'
    | 'Max'
    | 'Unlimited'
  )[] = [
    'Starter',
    'Hobby',
    'Business',
    'Scale',
    'Priority',
    'Ultra',
    'Max',
    'Unlimited',
  ]
  const targetTier:
    | 'Starter'
    | 'Hobby'
    | 'Business'
    | 'Scale'
    | 'Priority'
    | 'Ultra'
    | 'Max'
    | 'Unlimited' = isOnFreePlan
    ? 'Starter'
    : nextTierDef && validTiers.includes(nextTierDef.name as any)
      ? (nextTierDef.name as
          | 'Starter'
          | 'Hobby'
          | 'Business'
          | 'Scale'
          | 'Priority'
          | 'Ultra'
          | 'Max'
          | 'Unlimited')
      : 'Hobby'

  // For users who are out of credits (both free and paid), show consistent orange paywall
  if (creditsRemaining === 0) {
    const nextTierName = nextTierDef?.name ?? null
    const nextTierPrice = nextTierDef?.basePrice ?? 0
    const nextTierCredits = nextTierDef?.creditsIncluded ?? 0

    return (
      <>
        <div className="w-full max-w-full overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
              <Coins className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <h4 className="break-words text-sm font-semibold text-amber-900">
                Out of Agent Credits
              </h4>
              <p className="mt-0.5 break-words text-xs leading-relaxed text-amber-800">
                {isOnFreePlan
                  ? "You've used all your Free credits. Choose an option below to continue building."
                  : `You've used all your ${planName} credits. Choose an option below to continue building.`}
              </p>
              <div className="mt-3 space-y-2">
                {showUpgradeButton && (
                  <div className="flex flex-col gap-2">
                    {/* View tier option - opens dialog first */}
                    {nextTierDef && nextTierName && (
                      <Button
                        size="sm"
                        onClick={handleOpenUpgradeDialog}
                        className="h-8 w-full bg-amber-600 text-xs font-medium text-white hover:bg-amber-700"
                      >
                        <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                        <span className="truncate">
                          View {nextTierName} (${nextTierPrice}/mo)
                        </span>
                      </Button>
                    )}

                    {/* Credit pack option */}
                    <Popover
                      open={isPopoverOpen}
                      onOpenChange={(open) => {
                        // Prevent closing while a purchase is in progress
                        if (isPurchasing === null) {
                          setIsPopoverOpen(open)
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPurchasing !== null}
                          className="h-8 w-full border-amber-300 bg-white text-xs font-medium text-amber-700 hover:bg-amber-50"
                        >
                          {isPurchasing !== null ? (
                            <>
                              <div className="mr-1.5 h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                              <span className="truncate">Processing...</span>
                            </>
                          ) : (
                            <>
                              <Plus className="mr-1.5 h-3.5 w-3.5" />
                              <span className="truncate">Buy Credit Pack</span>
                            </>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-3" align="start">
                        <div className="space-y-3">
                          <div>
                            <h4 className="text-sm font-semibold text-zinc-900">
                              Get More Credits
                            </h4>
                            <p className="mt-1 text-xs text-zinc-600">
                              Choose one-time or recurring credits
                            </p>
                          </div>
                          <div className="space-y-2">
                            {/* Recurring option - better value */}
                            <button
                              onClick={() =>
                                handleBuyPack(
                                  CREDIT_PACK_OPTIONS.recurring.product.id,
                                  true,
                                )
                              }
                              disabled={isPurchasing !== null}
                              className="group relative flex w-full flex-col rounded-lg border-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 p-3 text-left transition-all hover:border-green-400 hover:from-green-100 hover:to-emerald-100 hover:shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <div className="absolute -top-2 left-3 rounded bg-green-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                BEST VALUE
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <RefreshCw className="h-4 w-4 text-green-600" />
                                  <div className="flex-1">
                                    <div className="text-sm font-semibold text-zinc-900">
                                      {CREDIT_PACK_OPTIONS.recurring.label}
                                    </div>
                                    <div className="text-xs text-zinc-600">
                                      {CREDIT_PACK_OPTIONS.recurring.amount} •{' '}
                                      {
                                        CREDIT_PACK_OPTIONS.recurring
                                          .description
                                      }
                                    </div>
                                  </div>
                                </div>
                                {isPurchasing ===
                                CREDIT_PACK_OPTIONS.recurring.product.id ? (
                                  <div className="flex items-center gap-2">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
                                    <span className="text-xs text-green-700">
                                      Processing...
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-sm font-bold text-green-700">
                                    {CREDIT_PACK_OPTIONS.recurring.price}
                                  </div>
                                )}
                              </div>
                              {isPurchasing !==
                                CREDIT_PACK_OPTIONS.recurring.product.id && (
                                <div className="mt-1.5 text-[10px] font-normal text-zinc-400">
                                  Click to purchase
                                </div>
                              )}
                            </button>

                            {/* One-time option */}
                            <button
                              onClick={() =>
                                handleBuyPack(
                                  CREDIT_PACK_OPTIONS.oneTime.product.id,
                                  false,
                                )
                              }
                              disabled={isPurchasing !== null}
                              className="group flex w-full flex-col rounded-lg border border-amber-200/60 bg-gradient-to-r from-amber-50/60 to-white/60 p-3 text-left transition-all hover:border-amber-300/80 hover:from-amber-100/80 hover:to-amber-50/80 hover:shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Zap className="h-4 w-4 text-amber-600" />
                                  <div className="flex-1">
                                    <div className="text-sm font-semibold text-zinc-900">
                                      {CREDIT_PACK_OPTIONS.oneTime.label}
                                    </div>
                                    <div className="text-xs text-zinc-600">
                                      {CREDIT_PACK_OPTIONS.oneTime.amount} •{' '}
                                      {CREDIT_PACK_OPTIONS.oneTime.description}
                                    </div>
                                  </div>
                                </div>
                                {isPurchasing ===
                                CREDIT_PACK_OPTIONS.oneTime.product.id ? (
                                  <div className="flex items-center gap-2">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                                    <span className="text-xs text-amber-700">
                                      Processing...
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-sm font-bold text-amber-700">
                                    {CREDIT_PACK_OPTIONS.oneTime.price}
                                  </div>
                                )}
                              </div>
                              {isPurchasing !==
                                CREDIT_PACK_OPTIONS.oneTime.product.id && (
                                <div className="mt-1.5 text-[10px] font-normal text-zinc-400">
                                  Click to purchase
                                </div>
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-zinc-500">
                            💡 Get better value by{' '}
                            <a
                              href="/web/dashboard"
                              className="font-medium underline hover:text-amber-800"
                            >
                              upgrading your tier
                            </a>{' '}
                            for more monthly credits.
                          </p>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
                <div className="break-words text-[11px] leading-relaxed text-amber-600">
                  💡 Your work is saved -{' '}
                  {nextTierDef
                    ? `upgrade to ${nextTierName} for ${formatCredits(nextTierCredits)} credits/month or `
                    : ''}
                  buy a credit pack ($12/mo recurring or $15 one-time)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Upgrade Confirmation Dialog */}
        <Dialog
          open={isUpgradeDialogOpen}
          onOpenChange={setIsUpgradeDialogOpen}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upgrade to {targetTier} Plan</DialogTitle>
            </DialogHeader>
            {/* UpgradePrompt with hidden title and no border - buttons are built-in below price */}
            <div className="mt-2">
              <UpgradePrompt
                requiredPlan={targetTier}
                message={
                  isOnFreePlan
                    ? `You've used all your free credits (4M one-time). Upgrade to ${targetTier} plan (${getFormattedPriceWithPeriod('starter')}) to get ${formatCredits(PLAN_BASE_CREDITS.starter)} credits every month and continue building with AI assistance.`
                    : `Upgrade to ${targetTier} plan to get more credits and continue building with AI assistance.`
                }
                showUpgradeButton={true}
                hideTitle={true}
                borderless={true}
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // For paid plan users or users with remaining credits, show the standard overlay
  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
          <Coins className="h-5 w-5 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-amber-900">
            {creditsRemaining === 0
              ? 'Out of Agent Credits'
              : 'Low Agent Credits'}
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-amber-800">
            {creditsRemaining === 0
              ? `You've used all ${totalCredits.toLocaleString()} credits on your ${planName} plan. Visit billing to increase your credit limit.`
              : `You have ${creditsRemaining.toLocaleString()} credits remaining out of ${totalCredits.toLocaleString()} on your ${planName} plan.`}
          </p>
          <div className="mt-4 space-y-3">
            {showUpgradeButton && (
              <Button
                onClick={handleUpgradeClick}
                size="sm"
                className="h-9 bg-amber-600 text-sm font-medium text-white hover:bg-amber-700"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Manage Billing
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            )}
            <div className="text-xs text-amber-600">
              💡 Your work is saved - upgrade anytime to continue
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface CreditWarningBannerProps {
  threshold?: number
  onUpgradeClick?: () => void
}

/**
 * Warning banner that appears when credits are running low
 * Shows above the chat input when credits are below threshold
 */
export function CreditWarningBanner({
  threshold = 100000, // Default threshold: 100k credits
  onUpgradeClick,
}: CreditWarningBannerProps) {
  const { creditsRemaining, isLoading } = useCreditsBalance()

  if (isLoading || creditsRemaining > threshold) {
    return null
  }

  return (
    <div className="mx-4 mb-2 rounded-lg border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <span className="text-sm font-medium text-orange-800">
            {creditsRemaining === 0
              ? 'No credits remaining'
              : `${creditsRemaining.toLocaleString()} credits remaining`}
          </span>
        </div>
        {onUpgradeClick && (
          <Button
            onClick={onUpgradeClick}
            size="sm"
            variant="outline"
            className="h-7 border-orange-300 bg-white/60 text-xs text-orange-700 hover:bg-orange-100"
          >
            Upgrade
          </Button>
        )}
      </div>
    </div>
  )
}
