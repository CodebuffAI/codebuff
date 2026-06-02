'use client'

/**
 * Credit Packs Section Component
 * Displays active recurring credit packs with renewal dates and cancellation
 * Also allows purchasing new credit packs (one-time or recurring)
 */

import { useState } from 'react'
import { useCustomer } from 'autumn-js/react'
import { RefreshCw, Zap, Plus, Calendar, AlertTriangle } from 'lucide-react'
import { Button } from '@/vly/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/vly/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/vly/components/ui/popover'
import { toast } from 'sonner'
import { oneTimeCreditPack, recurringCreditPack } from '@/vly/autumn.config'
import { useDirectPlanCheckout } from '@/vly/hooks/useDirectPlanCheckout'
import { cn } from '@/vly/lib/utils'

// Credit pack options
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

interface ActiveCreditPack {
  id: string // Unique identifier (subscription_id or generated)
  productId: string // The product ID for cancellation
  name: string
  status: string
  currentPeriodEnd?: number
  canceledAt?: number
}

export function CreditPacksSection() {
  const { customer, refetch, cancel } = useCustomer()
  const { directPlanCheckout } = useDirectPlanCheckout()
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [packToCancel, setPackToCancel] = useState<ActiveCreditPack | null>(
    null,
  )
  const [isCancelling, setIsCancelling] = useState(false)

  // Get active recurring credit packs from customer products
  // Each purchase creates a separate subscription instance with unique subscription_id
  const activeCreditPacks: ActiveCreditPack[] = (customer?.products || [])
    .filter(
      (product: any) =>
        product.id === 'recurring_credit_pack' &&
        (product.status === 'active' ||
          product.scenario === 'active' ||
          product.canceled_at),
    )
    .map((product: any, index: number) => ({
      id: product.subscription_id || `${product.id}-${index}`, // Use subscription_id for unique identification
      productId: product.id,
      name: product.name || 'Monthly Credit Pack',
      status: product.status || 'active',
      currentPeriodEnd: product.current_period_end,
      canceledAt: product.canceled_at,
    }))

  // Handle credit pack purchase
  const handleBuyPack = async (productId: string, isRecurring: boolean) => {
    setIsPurchasing(productId)
    // Keep popover open to show loading state

    try {
      await directPlanCheckout({
        productId,
        productName: isRecurring
          ? 'Monthly Credit Pack'
          : 'One-Time Credit Pack',
        isSubscriptionUpgrade: false,
      })
      toast.success(
        isRecurring
          ? 'Monthly credits activated!'
          : 'Credits purchased successfully!',
      )
      setIsPopoverOpen(false) // Close on success
      await refetch()
    } catch (error: any) {
      const redirectUrl =
        error?.url || error?.data?.url || (error as any)?.checkout_url
      if (redirectUrl) {
        window.location.href = redirectUrl
        return
      }
      toast.error(error?.message || 'Failed to purchase credits.')
      setIsPopoverOpen(false) // Close on error
    } finally {
      setIsPurchasing(null)
    }
  }

  // Handle pack cancellation
  const handleCancelPack = async () => {
    if (!packToCancel) return

    setIsCancelling(true)
    try {
      // Cancel using the product ID, not the subscription ID
      await cancel({
        productId: packToCancel.productId,
      })
      toast.success(
        "Credit pack cancelled. You'll keep access until the end of your billing period.",
      )
      await refetch()
      setCancelDialogOpen(false)
      setPackToCancel(null)
    } catch (error: any) {
      console.error('Cancel error:', error)
      toast.error(error?.message || 'Failed to cancel credit pack.')
    } finally {
      setIsCancelling(false)
    }
  }

  const openCancelDialog = (pack: ActiveCreditPack) => {
    setPackToCancel(pack)
    setCancelDialogOpen(true)
  }

  const formatDate = (timestamp: number | undefined) => {
    if (!timestamp) return 'Unknown'
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-4">
      {/* Header with Buy More button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Credit Packs</h3>
          <p className="text-xs text-zinc-500">
            One-time or recurring credit purchases
          </p>
        </div>
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
              className="h-8 gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              {isPurchasing !== null ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
                  Processing...
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Buy Credits
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3" align="end">
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-zinc-900">
                  Get More Credits
                </h4>
                <p className="mt-1 text-xs text-zinc-600">
                  Choose one-time or recurring
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
                  className="group relative flex w-full items-center justify-between rounded-lg border-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 p-3 text-left transition-all hover:border-green-400 hover:from-green-100 hover:to-emerald-100 hover:shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="absolute -top-2 left-3 rounded bg-green-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    BEST VALUE
                  </div>
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-green-600" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-zinc-900">
                        {CREDIT_PACK_OPTIONS.recurring.label}
                      </div>
                      <div className="text-xs text-zinc-600">
                        {CREDIT_PACK_OPTIONS.recurring.amount}
                      </div>
                    </div>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
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
                </button>

                {/* One-time option */}
                <button
                  onClick={() =>
                    handleBuyPack(CREDIT_PACK_OPTIONS.oneTime.product.id, false)
                  }
                  disabled={isPurchasing !== null}
                  className="group flex w-full items-center justify-between rounded-lg border border-amber-200/60 bg-gradient-to-r from-amber-50/60 to-white/60 p-3 text-left transition-all hover:border-amber-300/80 hover:from-amber-100/80 hover:to-amber-50/80 hover:shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-600" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-zinc-900">
                        {CREDIT_PACK_OPTIONS.oneTime.label}
                      </div>
                      <div className="text-xs text-zinc-600">
                        {CREDIT_PACK_OPTIONS.oneTime.amount}
                      </div>
                    </div>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    {isPurchasing === CREDIT_PACK_OPTIONS.oneTime.product.id ? (
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
                </button>
              </div>
              <p className="text-[10px] text-zinc-500">
                💡 Get better value by{' '}
                <a
                  href="/web/dashboard"
                  className="font-medium underline hover:text-zinc-700"
                >
                  upgrading your tier
                </a>{' '}
                for more monthly credits.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active Recurring Packs */}
      {activeCreditPacks.length > 0 ? (
        <div className="space-y-2">
          {activeCreditPacks.map((pack, index) => (
            <div
              key={`${pack.id}-${index}`}
              className={cn(
                'flex items-center justify-between rounded-lg border p-3',
                pack.canceledAt
                  ? 'border-zinc-200 bg-zinc-50'
                  : 'border-green-200 bg-green-50/50',
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full',
                    pack.canceledAt ? 'bg-zinc-200' : 'bg-green-100',
                  )}
                >
                  <RefreshCw
                    className={cn(
                      'h-4 w-4',
                      pack.canceledAt ? 'text-zinc-500' : 'text-green-600',
                    )}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900">
                      {pack.name}
                    </span>
                    {pack.canceledAt && (
                      <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                        Cancelling
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-zinc-500">
                    <Calendar className="h-3 w-3" />
                    {pack.canceledAt ? (
                      <span>Ends {formatDate(pack.currentPeriodEnd)}</span>
                    ) : (
                      <span>Renews {formatDate(pack.currentPeriodEnd)}</span>
                    )}
                  </div>
                </div>
              </div>
              {!pack.canceledAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openCancelDialog(pack)}
                  className="h-7 text-xs text-zinc-500 hover:text-red-600"
                >
                  Cancel
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-200 p-4 text-center">
          <p className="text-xs text-zinc-500">
            No active credit packs. Buy credits above when you need them.
          </p>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Cancel Credit Pack?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your monthly credit pack?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                You'll keep your credits until{' '}
                <strong>{formatDate(packToCancel?.currentPeriodEnd)}</strong>,
                then your pack will end and won't renew.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setCancelDialogOpen(false)}
              >
                Keep Pack
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleCancelPack}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Cancelling...
                  </>
                ) : (
                  'Cancel Pack'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
