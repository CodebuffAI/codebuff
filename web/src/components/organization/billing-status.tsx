'use client'

import { useQuery } from '@tanstack/react-query'
import {
  CreditCard,
  Users,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react'

import { pluralize } from '@codebuff/common/util/string'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

interface BillingStatus {
  seatCount: number
  pricePerSeat: number
  totalMonthlyCost: number
  hasActiveSubscription: boolean
  subscriptionDetails?: {
    status: string
    current_period_start: number
    current_period_end: number
    cancel_at_period_end: boolean
  }
  billingPortalUrl?: string
  organization: {
    id: string
    name: string
    slug: string
  }
}

interface BillingStatusProps {
  organizationId: string
  noCardWrapper?: boolean
}

async function fetchBillingStatus(
  organizationId: string,
): Promise<BillingStatus> {
  const response = await fetch(`/api/orgs/${organizationId}/billing/status`)
  if (!response.ok) {
    throw new Error('Failed to fetch billing status')
  }
  return response.json()
}

export function BillingStatus({
  organizationId,
  noCardWrapper = false,
}: BillingStatusProps) {
  const isMobile = useIsMobile()

  const {
    data: billingStatus,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['billingStatus', organizationId],
    queryFn: () => fetchBillingStatus(organizationId),
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
  })

  if (isLoading) {
    return (
      <Card
        className={cn(
          'w-full',
          noCardWrapper && 'border-0 shadow-none bg-transparent',
        )}
      >
        <CardHeader
          className={noCardWrapper ? 'p-0' : 'px-4 py-3 sm:px-6 sm:py-4'}
        >
          <CardTitle className="flex items-center text-base sm:text-lg">
            <CreditCard className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            Billing & Seats
          </CardTitle>
        </CardHeader>
        <CardContent
          className={noCardWrapper ? 'p-0' : 'px-4 pb-4 sm:px-6 sm:pb-6'}
        >
          <div className="space-y-3 sm:space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !billingStatus) {
    return (
      <Card
        className={cn(
          'w-full',
          noCardWrapper && 'border-0 shadow-none bg-transparent',
        )}
      >
        <CardHeader
          className={noCardWrapper ? 'p-0' : 'px-4 py-3 sm:px-6 sm:py-4'}
        >
          <CardTitle className="flex items-center text-base sm:text-lg">
            <CreditCard className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            Billing & Seats
          </CardTitle>
        </CardHeader>
        <CardContent
          className={noCardWrapper ? 'p-0' : 'px-4 pb-4 sm:px-6 sm:pb-6'}
        >
          <div className="text-center py-6 sm:py-8 text-muted-foreground">
            <AlertTriangle className="mx-auto h-6 w-6 sm:h-8 sm:w-8 mb-2 opacity-50" />
            <p className="text-sm sm:text-base">
              Unable to load billing information
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const getSubscriptionStatusBadge = () => {
    if (!billingStatus.hasActiveSubscription) {
      return (
        <Badge variant="outline" className="text-xs">
          No Subscription
        </Badge>
      )
    }

    const status = billingStatus.subscriptionDetails?.status
    switch (status) {
      case 'active':
        return (
          <Badge
            variant="default"
            className="text-xs bg-green-100 text-green-800"
          >
            <CheckCircle className="mr-1 h-3 w-3" />
            Active
          </Badge>
        )
      case 'canceled':
        return (
          <Badge variant="destructive" className="text-xs">
            Canceled
          </Badge>
        )
      case 'past_due':
        return (
          <Badge variant="destructive" className="text-xs">
            Past Due
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="text-xs">
            {status}
          </Badge>
        )
    }
  }

  return (
    <Card
      className={cn(
        'w-full',
        noCardWrapper && 'border-0 shadow-none bg-transparent',
      )}
    >
      <CardHeader
        className={noCardWrapper ? 'p-0' : 'px-4 py-3 sm:px-6 sm:py-4'}
      >
        <CardTitle className="flex items-center justify-between text-base sm:text-lg">
          <span className="flex items-center min-w-0">
            <CreditCard className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            <span className="truncate">Billing & Seats</span>
          </span>
          {getSubscriptionStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent
        className={noCardWrapper ? 'p-0' : 'px-4 pb-4 sm:px-6 sm:pb-6'}
      >
        <div className="space-y-4 sm:space-y-6">
          {/* Seat Information */}
          <div className="p-3 sm:p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <Users className="mr-2 h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                <span className="font-medium text-sm sm:text-base">
                  {pluralize(billingStatus.seatCount, 'Seat')}
                </span>
              </div>
              <span className="text-lg sm:text-xl font-bold">
                {billingStatus.seatCount}
              </span>
            </div>

            <div className="space-y-2 text-xs sm:text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Price per seat</span>
                <span className="font-medium">
                  ${billingStatus.pricePerSeat}/month
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total monthly cost</span>
                <span className="font-medium text-foreground">
                  ${billingStatus.totalMonthlyCost}/month
                </span>
              </div>
            </div>

            {billingStatus.subscriptionDetails?.cancel_at_period_end && (
              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-md">
                <div className="flex items-center">
                  <AlertTriangle className="mr-2 h-4 w-4 text-amber-600" />
                  <span className="text-xs sm:text-sm text-amber-700 font-medium">
                    Subscription will cancel at period end
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Billing Portal Link */}
          {billingStatus.billingPortalUrl && (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                asChild
                variant="outline"
                size={isMobile ? 'sm' : 'default'}
                className="w-full sm:w-auto"
              >
                <a
                  href={billingStatus.billingPortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage Billing
                </a>
              </Button>
            </div>
          )}

          {/* Subscription Details */}
          {billingStatus.hasActiveSubscription &&
            billingStatus.subscriptionDetails && (
              <div className="text-xs sm:text-sm text-muted-foreground">
                <p>
                  Current billing period:{' '}
                  {new Date(
                    billingStatus.subscriptionDetails.current_period_start *
                      1000,
                  ).toLocaleDateString()}{' '}
                  -{' '}
                  {new Date(
                    billingStatus.subscriptionDetails.current_period_end * 1000,
                  ).toLocaleDateString()}
                </p>
              </div>
            )}

          {!billingStatus.hasActiveSubscription && (
            <div className="p-3 sm:p-4 border border-amber-200 bg-amber-50 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="mr-2 h-4 w-4 sm:h-5 sm:w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800 text-sm sm:text-base">
                    No Active Subscription
                  </h4>
                  <p className="text-xs sm:text-sm text-amber-700 mt-1">
                    Set up billing to enable team features and automatic seat
                    management.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
