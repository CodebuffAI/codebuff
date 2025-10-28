'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  CreditCard,
  Users,
  AlertTriangle,
  Power,
  Loader2,
  BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useIsMobile } from '@/hooks/use-mobile'
import { useOrgAutoTopup } from '@/hooks/use-org-auto-topup'
import { cn } from '@/lib/utils'

interface CreditStatus {
  currentBalance: number
  usageThisCycle: number
  cycleStartDate: string
  cycleEndDate: string
  topUsers: Array<{
    user_id: string
    user_name: string
    user_email: string
    credits_used: number
  }>
}

interface OrganizationSettings {
  id: string
  name: string
  slug: string
  userRole: 'owner' | 'admin' | 'member'
  autoTopupEnabled: boolean
  autoTopupThreshold: number
  autoTopupAmount: number
}

interface CreditMonitorProps {
  organizationId: string
  orgSlug: string // Added orgSlug prop
  noCardWrapper?: boolean
}

async function fetchCreditStatus(
  organizationId: string,
): Promise<CreditStatus> {
  const response = await fetch(`/api/orgs/${organizationId}/usage`)
  if (!response.ok) {
    throw new Error('Failed to fetch credit status')
  }
  const data = await response.json()

  return {
    currentBalance: data.currentBalance || 0,
    usageThisCycle: data.usageThisCycle || 0,
    cycleStartDate: data.cycleStartDate || new Date().toISOString(),
    cycleEndDate: data.cycleEndDate || new Date().toISOString(),
    topUsers: (data.topUsers || []).map((user: any) => ({
      user_id: user.user_id,
      user_name: user.user_name || 'Unknown',
      user_email: user.user_email || 'Unknown',
      credits_used: user.credits_used || 0,
    })),
  }
}

async function fetchOrganizationSettings(
  organizationId: string,
): Promise<OrganizationSettings> {
  const response = await fetch(`/api/orgs/${organizationId}/settings`)
  if (!response.ok) {
    throw new Error('Failed to fetch organization settings')
  }
  return response.json()
}

export function CreditMonitor({
  organizationId,
  orgSlug, // Destructure orgSlug
  noCardWrapper = false,
}: CreditMonitorProps) {
  const isMobile = useIsMobile()
  const router = useRouter()
  const [isRedirecting, setIsRedirecting] = useState(false)

  const {
    data: creditStatus,
    isLoading,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['creditStatus', organizationId],
    queryFn: () => fetchCreditStatus(organizationId),
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })

  const { data: orgSettings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['organizationSettings', organizationId],
    queryFn: () => fetchOrganizationSettings(organizationId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })

  // Use the auto-topup hook for toggle functionality
  const {
    isEnabled: autoTopupEnabled,
    canManageAutoTopup,
    handleToggleAutoTopup,
    isPending: isAutoTopupPending,
  } = useOrgAutoTopup(organizationId)

  const queryClient = useQueryClient()

  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: ['creditStatus', organizationId],
    })
    queryClient.invalidateQueries({
      queryKey: ['organizationSettings', organizationId],
    })
  }

  const handleEnableAutoTopup = async () => {
    if (!orgSettings || !canManageAutoTopup) return

    setIsRedirecting(true)

    try {
      // Enable auto top-up first
      const success = await handleToggleAutoTopup(true)

      if (success) {
        // Navigate to billing page
        router.push(`/orgs/${orgSettings.slug}/billing/purchase`)
      } else {
        // Reset loading state if enabling failed
        setIsRedirecting(false)
      }
    } catch (error) {
      // Error handling is already done in the hook
      console.error('Failed to enable auto top-up:', error)
      setIsRedirecting(false)
    }
  }

  if (isLoading || isLoadingSettings) {
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
            Credit Monitor
          </CardTitle>
        </CardHeader>
        <CardContent
          className={noCardWrapper ? 'p-0' : 'px-4 pb-4 sm:px-6 sm:pb-6'}
        >
          <div className="space-y-3 sm:space-y-4">
            <div className="h-3 sm:h-4 bg-gray-200 rounded animate-pulse" />
            <div className="h-16 sm:h-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-24 sm:h-32 bg-gray-200 rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!creditStatus || !orgSettings) {
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
            Credit Monitor
          </CardTitle>
        </CardHeader>
        <CardContent
          className={noCardWrapper ? 'p-0' : 'px-4 pb-4 sm:px-6 sm:pb-6'}
        >
          <div className="text-center py-6 sm:py-8 text-muted-foreground">
            <AlertTriangle className="mx-auto h-6 w-6 sm:h-8 sm:w-8 mb-2 opacity-50" />
            <p className="text-sm sm:text-base">
              Unable to load credit information
            </p>
            <p className="text-xs sm:text-sm">Please try refreshing the page</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const LOW_BALANCE_THRESHOLD = 500
  const isLowBalance = creditStatus.currentBalance < LOW_BALANCE_THRESHOLD

  // Calculate usage percentage for progress bar
  const totalCredits = creditStatus.currentBalance + creditStatus.usageThisCycle
  const usagePercentage =
    totalCredits > 0 ? (creditStatus.usageThisCycle / totalCredits) * 100 : 0

  // Check if auto top-up is disabled and user can manage it
  const isAutoTopupDisabled = !orgSettings?.autoTopupEnabled
  const shouldShowAutoTopupBanner = isAutoTopupDisabled && canManageAutoTopup

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
            <span className="truncate">Credit Monitor</span>
          </span>
          <div className="flex items-center space-x-2">
            {' '}
            {/* Group for buttons */}
            <Link href={`/orgs/${orgSlug}/usage`}>
              <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3">
                {' '}
                {/* Adjusted size for consistency */}
                <BarChart3 className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" />{' '}
                {/* Icon for usage button */}
                <span className="hidden sm:inline">Usage Details</span>
                <span className="sm:hidden">Details</span>
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
              className="h-8 w-8 p-0"
            >
              <RefreshCw
                className={cn('h-4 w-4', isFetching && 'animate-spin')}
              />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent
        className={noCardWrapper ? 'p-0' : 'px-4 pb-4 sm:px-6 sm:pb-6'}
      >
        <div className="space-y-4 sm:space-y-6">
          {/* Auto Top-up Disabled Banner */}
          {shouldShowAutoTopupBanner && orgSettings && (
            <div className="p-3 sm:p-4 border border-amber-200 bg-amber-50 rounded-lg">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-start sm:items-center flex-1 min-w-0">
                  <AlertTriangle className="mr-3 h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-amber-800 text-sm sm:text-base">
                      Auto Top-up Disabled
                    </h4>
                    <p className="text-xs sm:text-sm text-amber-700 mt-1">
                      Enable auto top-up to automatically purchase credits when
                      your balance runs low.
                    </p>
                  </div>
                </div>
                <Button
                  size={isMobile ? 'sm' : 'default'}
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={handleEnableAutoTopup}
                  disabled={isAutoTopupPending || isRedirecting}
                >
                  {isAutoTopupPending || isRedirecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Power className="mr-2 h-4 w-4" />
                  )}
                  {isAutoTopupPending || isRedirecting
                    ? 'Enabling...'
                    : 'Enable'}
                </Button>
              </div>
            </div>
          )}

          {dataUpdatedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
            </p>
          )}

          {/* Credit Usage Progress */}
          <div
            className={`p-3 sm:p-4 border rounded-lg ${isLowBalance ? 'border-red-200 bg-red-50' : ''}`}
          >
            {/* Credit Usage Progress Bar */}
            <div className="space-y-3 mb-3">
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-muted-foreground">
                  Credit Usage This Cycle
                </span>
                <span className="font-medium">
                  {usagePercentage.toFixed(1)}%
                </span>
              </div>
              <Progress
                value={usagePercentage}
                className={`h-2 sm:h-3 ${isLowBalance ? 'bg-red-100' : ''}`}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-muted-foreground">Used this cycle</span>
                <span className="font-medium">
                  {creditStatus.usageThisCycle.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-muted-foreground">Total credits</span>
                <span className="font-medium">
                  {totalCredits.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-muted-foreground">Cycle resets</span>
                <span className="font-medium">
                  {(() => {
                    try {
                      const date = new Date(creditStatus.cycleEndDate)
                      return isNaN(date.getTime())
                        ? 'Unknown'
                        : date.toLocaleDateString()
                    } catch {
                      return 'Unknown'
                    }
                  })()}
                </span>
              </div>
            </div>

            {isLowBalance && (
              <div className="mt-3 p-2 sm:p-3 bg-red-100 border border-red-200 rounded-md">
                <div className="flex items-center">
                  <AlertTriangle className="mr-2 h-4 w-4 text-red-600 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-red-700 font-medium">
                    Low balance warning
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-red-600 mt-1">
                  Consider purchasing more credits or enabling auto top-up.
                </p>
              </div>
            )}
          </div>

          {/* Top Users This Cycle */}
          <div>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-base sm:text-lg font-semibold flex items-center">
                <Users className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">Top Users This Cycle</span>
                <span className="sm:hidden">Top Users</span>
              </h3>
            </div>
            <div className="space-y-2 sm:space-y-3">
              {creditStatus.topUsers && creditStatus.topUsers.length > 0 ? (
                creditStatus.topUsers.map((user, index) => {
                  const displayName =
                    user.user_name || user.user_email || 'Unknown User'

                  return (
                    <div
                      key={user.user_id}
                      className="flex items-center justify-between p-2 sm:p-3 border rounded-lg"
                    >
                      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-600 font-semibold text-xs sm:text-sm">
                            #{index + 1}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-xs sm:text-sm truncate">
                            {displayName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {user.user_email}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="font-semibold text-xs sm:text-sm">
                          {user.credits_used.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">credits</p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-4 sm:py-6 text-muted-foreground">
                  <Users className="mx-auto h-6 w-6 sm:h-8 sm:w-8 mb-2 opacity-50" />
                  <p className="text-sm">
                    No usage data available for this cycle
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
