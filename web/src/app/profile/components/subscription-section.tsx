'use client'

import {
  SUBSCRIPTION_DISPLAY_NAME,
  SUBSCRIPTION_TIERS,
} from '@codebuff/common/constants/subscription-plans'

import type { SubscriptionTierPrice } from '@codebuff/common/constants/subscription-plans'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap,
  Clock,
  CalendarDays,
  Loader2,
  AlertTriangle,
  ArrowRightLeft,
} from 'lucide-react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

interface SubscriptionApiResponse {
  hasSubscription: boolean
  displayName?: string
  subscription?: {
    status: string
    billingPeriodEnd: string
    cancelAtPeriodEnd: boolean
    canceledAt: string | null
    tier?: number | null
  }
  rateLimit?: {
    limited: boolean
    reason?: 'block_exhausted' | 'weekly_limit'
    canStartNewBlock: boolean
    blockUsed?: number
    blockLimit?: number
    blockResetsAt?: string
    weeklyUsed: number
    weeklyLimit: number
    weeklyResetsAt: string
    weeklyPercentUsed: number
  }
  limits?: {
    creditsPerBlock: number
    blockDurationHours: number
    weeklyCreditsLimit: number
  }
}

function formatRelativeTime(dateStr: string): string {
  const target = new Date(dateStr)
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return 'now'
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function ProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number
  max: number
  label: string
  className?: string
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        'h-2.5 w-full rounded-full bg-muted overflow-hidden',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all duration-500',
          percent >= 100
            ? 'bg-red-500'
            : percent >= 75
              ? 'bg-yellow-500'
              : 'bg-indigo-500',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

function SubscriptionActive({
  data,
}: {
  data: SubscriptionApiResponse
}) {
  const queryClient = useQueryClient()
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showChangePlanDialog, setShowChangePlanDialog] = useState(false)

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to cancel subscription')
      }
      return response.json()
    },
    onSuccess: () => {
      setShowCancelDialog(false)
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
      toast({
        title: 'Subscription canceled',
        description: `Your ${SUBSCRIPTION_DISPLAY_NAME} subscription will remain active until the end of your billing period.`,
      })
    },
    onError: (error: Error) => {
      setShowCancelDialog(false)
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const changeTierMutation = useMutation({
    mutationFn: async (selectedTier: SubscriptionTierPrice) => {
      const response = await fetch('/api/stripe/change-subscription-tier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: selectedTier }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to change plan')
      }
      return response.json()
    },
    onSuccess: () => {
      setShowChangePlanDialog(false)
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
      toast({
        title: 'Plan changed',
        description: 'Your subscription plan has been updated.',
      })
    },
    onError: (error: Error) => {
      setShowChangePlanDialog(false)
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const { subscription, rateLimit } = data

  const isCanceling = subscription?.cancelAtPeriodEnd
  const currentTier = (subscription?.tier ?? 200) as SubscriptionTierPrice

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-indigo-500" />
            {SUBSCRIPTION_DISPLAY_NAME} · ${subscription?.tier ?? 200}/mo
          </CardTitle>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              isCanceling
                ? 'bg-muted text-muted-foreground'
                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            )}
          >
            {isCanceling ? 'Canceling' : 'Active'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Block usage */}
        {rateLimit && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Current Block
                </span>
                {rateLimit.blockResetsAt ? (
                  <span className="text-muted-foreground">
                    Resets in {formatRelativeTime(rateLimit.blockResetsAt)}
                  </span>
                ) : rateLimit.canStartNewBlock ? (
                  <span className="text-muted-foreground">
                    Ready for new session
                  </span>
                ) : null}
              </div>
              {rateLimit.blockLimit != null &&
              rateLimit.blockUsed != null ? (
                <>
                  <ProgressBar
                    value={rateLimit.blockUsed}
                    max={rateLimit.blockLimit}
                    label="Block usage"
                  />
                  <p className="text-xs text-muted-foreground">
                    {rateLimit.blockLimit > 0
                      ? `${Math.round((rateLimit.blockUsed / rateLimit.blockLimit) * 100)}% used`
                      : '0% used'}
                  </p>
                </>
              ) : (
                <>
                  <ProgressBar value={0} max={1} label="Block usage" />
                  <p className="text-xs text-muted-foreground">
                    No active block — a new session will start when you use
                    Codebuff
                  </p>
                </>
              )}
            </div>

            {/* Weekly usage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  Weekly Usage
                </span>
                <span className="text-muted-foreground">
                  Resets {formatShortDate(rateLimit.weeklyResetsAt)}
                </span>
              </div>
              <ProgressBar
                value={rateLimit.weeklyUsed}
                max={rateLimit.weeklyLimit}
                label="Weekly usage"
              />
              <p className="text-xs text-muted-foreground">
                {rateLimit.weeklyPercentUsed}% used
              </p>
            </div>

            {/* Rate limit warning */}
            {rateLimit.limited && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  {rateLimit.reason === 'weekly_limit'
                    ? `Weekly limit reached. Resets ${formatShortDate(rateLimit.weeklyResetsAt)}. You can still use a-la-carte credits.`
                    : `Block exhausted. New block in ${rateLimit.blockResetsAt ? formatRelativeTime(rateLimit.blockResetsAt) : 'soon'}. You can still use a-la-carte credits.`}
                </p>
              </div>
            )}
          </>
        )}

        {/* Billing info & cancel */}
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {isCanceling
              ? `Cancels ${subscription ? formatDate(subscription.billingPeriodEnd) : ''}`
              : `Renews ${subscription ? formatDate(subscription.billingPeriodEnd) : ''}`}
          </p>
          {!isCanceling && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setShowChangePlanDialog(true)}
              >
                <ArrowRightLeft className="mr-1 h-3 w-3" />
                Change Plan
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setShowCancelDialog(true)}
              >
                Cancel Subscription
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
            <DialogDescription>
              Your {SUBSCRIPTION_DISPLAY_NAME} subscription will remain active
              until{' '}
              {subscription
                ? formatDate(subscription.billingPeriodEnd)
                : 'the end of your billing period'}
              . After that, you'll return to the free tier.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              disabled={cancelMutation.isPending}
            >
              Keep Subscription
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              Yes, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showChangePlanDialog} onOpenChange={setShowChangePlanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Plan</DialogTitle>
            <DialogDescription>
              Select a new plan for your {SUBSCRIPTION_DISPLAY_NAME} subscription. The change takes effect immediately with a prorated charge.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            {Object.entries(SUBSCRIPTION_TIERS).map(
              ([key, tier]) => {
                const tierPrice = Number(key) as SubscriptionTierPrice
                const isCurrent = tierPrice === currentTier
                const tierName =
                  tierPrice === 100
                    ? 'Starter'
                    : tierPrice === 200
                      ? 'Pro'
                      : 'Team'
                const tierDescription =
                  tierPrice === 100
                    ? 'Great for individuals getting started.'
                    : tierPrice === 200
                      ? 'For professionals who need more capacity.'
                      : 'For power users and teams with heavy workloads.'
                return (
                  <button
                    key={tierPrice}
                    disabled={isCurrent || changeTierMutation.isPending}
                    onClick={() => changeTierMutation.mutate(tierPrice)}
                    className={cn(
                      'flex items-center justify-between rounded-lg border p-4 text-left transition-colors',
                      isCurrent
                        ? 'cursor-default border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/20'
                        : 'hover:border-indigo-300 hover:bg-muted dark:hover:border-indigo-700',
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{tierName}</span>
                        {isCurrent && (
                          <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {tierDescription}
                      </p>
                    </div>
                    <span className="ml-4 text-lg font-semibold">
                      ${tier.monthlyPrice}/mo
                    </span>
                  </button>
                )
              },
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowChangePlanDialog(false)}
              disabled={changeTierMutation.isPending}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function SubscriptionCta() {
  return (
    <Card className="border-indigo-200 dark:border-indigo-800">
      <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
            <Zap className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold">
              Upgrade to {SUBSCRIPTION_DISPLAY_NAME}
            </h3>
            <p className="text-sm text-muted-foreground">
              From $100/mo · Work in focused 5-hour sessions with no
              interruptions.
            </p>
          </div>
        </div>
        <Link href="/strong">
          <Button className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600">
            Learn More
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}

export function SubscriptionSection() {
  const { status } = useSession()

  const { data, isLoading } = useQuery<SubscriptionApiResponse>({
    queryKey: ['subscription'],
    queryFn: async () => {
      const res = await fetch('/api/user/subscription')
      if (!res.ok) throw new Error('Failed to fetch subscription')
      return res.json()
    },
    enabled: status === 'authenticated',
    refetchInterval: 60_000,
  })

  if (status !== 'authenticated') return null
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading subscription...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data || !data.hasSubscription) {
    return <SubscriptionCta />
  }

  return <SubscriptionActive data={data} />
}
