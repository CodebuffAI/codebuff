'use client'

import { SUBSCRIPTION_DISPLAY_NAME } from '@codebuff/common/constants/subscription-plans'
import { env } from '@codebuff/common/env'
import { useQuery } from '@tanstack/react-query'
import {
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

function formatHours(dateStr: string): string {
  const target = new Date(dateStr)
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()
  if (isNaN(diffMs) || diffMs <= 0) return '0h'
  const hours = Math.ceil(diffMs / (1000 * 60 * 60))
  return `${hours}h`
}


function ProgressBar({
  percentAvailable,
  label,
  className,
}: {
  percentAvailable: number
  label: string
  className?: string
}) {
  const percent = Math.min(100, Math.max(0, Math.round(percentAvailable)))
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
          percent <= 0
            ? 'bg-red-500'
            : percent <= 25
              ? 'bg-yellow-500'
              : 'bg-green-500',
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
    <Card className="max-w-xl">
      <CardHeader className="pb-5">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-baseline gap-2 text-lg">
            <span>💪</span>
            {SUBSCRIPTION_DISPLAY_NAME}
            <span className="text-sm font-normal text-muted-foreground">
              ${subscription?.tier ?? 200}/mo
            </span>
            {isCanceling && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                Canceling
              </span>
            )}
          </CardTitle>
          <a
            href={billingPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            Manage
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Block usage */}
        {rateLimit && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  Session
                </span>
                <span className="text-muted-foreground">
                  {rateLimit.blockLimit != null && rateLimit.blockUsed != null && rateLimit.blockLimit > 0
                    ? `${Math.round(100 - (rateLimit.blockUsed / rateLimit.blockLimit) * 100)}%`
                    : '100%'}
                  {rateLimit.blockResetsAt && ` · Resets in ${formatHours(rateLimit.blockResetsAt)}`}
                </span>
              </div>
              <ProgressBar
                percentAvailable={
                  rateLimit.blockLimit != null && rateLimit.blockUsed != null && rateLimit.blockLimit > 0
                    ? 100 - (rateLimit.blockUsed / rateLimit.blockLimit) * 100
                    : 100
                }
                label="Session usage"
              />
            </div>

            {/* Weekly usage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  Weekly
                </span>
                <span className="text-muted-foreground">
                  {100 - rateLimit.weeklyPercentUsed}% · Resets in {formatHours(rateLimit.weeklyResetsAt)}
                </span>
              </div>
              <ProgressBar
                percentAvailable={100 - rateLimit.weeklyPercentUsed}
                label="Weekly usage"
              />
            </div>

            {/* Rate limit warning */}
            {rateLimit.limited && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  {rateLimit.reason === 'weekly_limit'
                    ? `Weekly limit reached. Resets in ${formatHours(rateLimit.weeklyResetsAt)}. You can still use a-la-carte credits.`
                    : `Session exhausted. New session in ${rateLimit.blockResetsAt ? formatHours(rateLimit.blockResetsAt) : 'soon'}. You can still use a-la-carte credits.`}
                </p>
              </div>
            )}
          </>
        )}


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
            <span className="text-xl">💪</span>
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
