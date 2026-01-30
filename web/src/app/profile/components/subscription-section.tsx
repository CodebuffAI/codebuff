'use client'

import { SUBSCRIPTION_DISPLAY_NAME } from '@codebuff/common/constants/subscription-plans'
import { env } from '@codebuff/common/env'
import { useQuery } from '@tanstack/react-query'
import {
  Zap,
  Clock,
  CalendarDays,
  AlertTriangle,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  email,
}: {
  data: SubscriptionApiResponse
  email: string
}) {
  const { subscription, rateLimit } = data

  const isCanceling = subscription?.cancelAtPeriodEnd
  const billingPortalUrl = `${env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}?prefilled_email=${encodeURIComponent(email)}`

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

        {/* Billing info & manage */}
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {isCanceling
              ? `Cancels ${subscription ? formatDate(subscription.billingPeriodEnd) : ''}`
              : `Renews ${subscription ? formatDate(subscription.billingPeriodEnd) : ''}`}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            asChild
          >
            <a href={billingPortalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Manage Subscription
            </a>
          </Button>
        </div>
      </CardContent>
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
  const { data: session, status } = useSession()

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

  const email = session?.user?.email || ''

  return <SubscriptionActive data={data} email={email} />
}
