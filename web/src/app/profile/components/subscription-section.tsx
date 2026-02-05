'use client'

import { SUBSCRIPTION_DISPLAY_NAME } from '@codebuff/common/constants/subscription-plans'
import { env } from '@codebuff/common/env'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

import { formatTimeUntil } from '@codebuff/common/util/dates'

import type {
  SubscriptionResponse,
  ActiveSubscriptionResponse,
} from '@codebuff/common/types/subscription'

const formatDaysHours = (dateStr: string): string =>
  formatTimeUntil(dateStr, { fallback: '0h' })

const clampPercent = (n: number): number => Math.min(100, Math.max(0, Math.round(n)))

function ProgressBar({ percentAvailable, label }: { percentAvailable: number; label: string }) {
  const percent = Math.min(100, Math.max(0, Math.round(percentAvailable)))
  const colorClass = percent <= 0 ? 'bg-red-500' : percent <= 25 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${percent}% remaining`}
      aria-label={label}
      className="h-3 w-full rounded-full bg-muted overflow-hidden"
    >
      <div
        className={cn('h-full rounded-full transition-all duration-500', colorClass)}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

function SubscriptionActive({ data, email }: { data: ActiveSubscriptionResponse; email: string }) {
  const { subscription, rateLimit, fallbackToALaCarte } = data
  const isCanceling = subscription.cancelAtPeriodEnd
  const fallbackPortalUrl = `${env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}?prefilled_email=${encodeURIComponent(email)}`
  const billingPortalUrl = data.billingPortalUrl ?? fallbackPortalUrl
  const queryClient = useQueryClient()

  const updatePreferenceMutation = useMutation({
    mutationFn: async (newValue: boolean) => {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fallbackToALaCarte: newValue }),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to update preference' }))
        throw new Error(error.error || 'Failed to update preference')
      }
      return newValue
    },
    onSuccess: (newValue) => {
      queryClient.setQueryData(['subscription'], (old: SubscriptionResponse | undefined) =>
        old ? { ...old, fallbackToALaCarte: newValue } : old
      )
    },
    onError: (err: Error) => {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      })
    },
    onSettled: () => {
      // Refetch to ensure consistency with server
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
  })

  const blockRemainingPercent =
    rateLimit.blockLimit != null && rateLimit.blockUsed != null && rateLimit.blockLimit > 0
      ? clampPercent(100 - (rateLimit.blockUsed / rateLimit.blockLimit) * 100)
      : 100
  const weeklyRemainingPercent = clampPercent(100 - rateLimit.weeklyPercentUsed)

  return (
    <Card>
      <CardHeader className="pb-5">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-baseline gap-2 text-lg">
            <span>💪</span>
            {SUBSCRIPTION_DISPLAY_NAME}
            <span className="text-sm font-normal text-muted-foreground">
              ${subscription.tier}/mo
            </span>
            {isCanceling && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                Canceling
              </span>
            )}
            {subscription.scheduledTier != null && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                Renewing at ${subscription.scheduledTier}/mo
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
        {rateLimit.limited && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              {rateLimit.reason === 'weekly_limit'
                ? `Weekly limit reached. Resets in ${formatDaysHours(rateLimit.weeklyResetsAt)}. ${fallbackToALaCarte ? 'Automatically using your credits.' : 'Your credits will not be used.'}`
                : `Session exhausted. New session in ${rateLimit.blockResetsAt ? formatDaysHours(rateLimit.blockResetsAt) : 'soon'}. ${fallbackToALaCarte ? 'Automatically using your credits.' : 'Your credits will not be used.'}`}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-10">
          <div className="space-y-2">
            <span className="text-sm font-medium">5-hour limit</span>
            <ProgressBar
              percentAvailable={blockRemainingPercent}
              label="5-hour usage"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{blockRemainingPercent}% remaining</span>
              {rateLimit.blockResetsAt && (
                <>
                  <span>·</span>
                  <span>Resets in {formatDaysHours(rateLimit.blockResetsAt)}</span>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Weekly limit</span>
            <ProgressBar
              percentAvailable={weeklyRemainingPercent}
              label="Weekly usage"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{weeklyRemainingPercent}% remaining</span>
              <span>·</span>
              <span>Resets in {formatDaysHours(rateLimit.weeklyResetsAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="always-use-credits"
            checked={fallbackToALaCarte}
            onCheckedChange={(checked) => updatePreferenceMutation.mutate(checked)}
            disabled={updatePreferenceMutation.isPending}
          />
          <Label htmlFor="always-use-credits" className="text-sm cursor-pointer">
            Use a-la-carte credits when limit is reached
          </Label>
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
            <span className="text-xl">💪</span>
          </div>
          <div>
            <h3 className="font-semibold">
              Upgrade to {SUBSCRIPTION_DISPLAY_NAME}
            </h3>
            <p className="text-sm text-muted-foreground">
              From $100/mo · Save credits with 5-hour work sessions included
            </p>
          </div>
        </div>
        <Button asChild className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600">
          <Link href="/pricing">Learn More</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function SubscriptionSection() {
  const { data: session, status } = useSession()

  const { data, isLoading } = useQuery<SubscriptionResponse>({
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
