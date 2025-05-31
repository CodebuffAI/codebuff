'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  RefreshCw,
  CreditCard,
  TrendingUp,
  Users,
  AlertTriangle,
  Settings,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useOrgAutoTopup } from '@/hooks/use-org-auto-topup'

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
  noCardWrapper?: boolean
}

async function fetchCreditStatus(
  organizationId: string
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
  organizationId: string
): Promise<OrganizationSettings> {
  const response = await fetch(`/api/orgs/${organizationId}/settings`)
  if (!response.ok) {
    throw new Error('Failed to fetch organization settings')
  }
  return response.json()
}

export function CreditMonitor({
  organizationId,
  noCardWrapper,
}: CreditMonitorProps) {
  const {
    data: creditStatus,
    isLoading,
    isError,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['creditStatus', organizationId],
    queryFn: () => fetchCreditStatus(organizationId),
    staleTime: 5 * 60 * 1000, // 5 minutes
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

  if (isLoading || isLoadingSettings) {
    return (
      <Card
        className={
          noCardWrapper ? 'border-none shadow-none bg-transparent' : ''
        }
      >
        <CardHeader className={noCardWrapper ? 'p-0' : ''}>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <CreditCard className="mr-2 h-5 w-5" />
              Credit Monitor
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className={noCardWrapper ? 'p-0' : ''}>
          <div className="space-y-6">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card
        className={
          noCardWrapper ? 'border-none shadow-none bg-transparent' : ''
        }
      >
        <CardHeader className={noCardWrapper ? 'p-0' : ''}>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <CreditCard className="mr-2 h-5 w-5" />
              Credit Monitor
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className={noCardWrapper ? 'p-0' : ''}>
          <div className="text-center py-8">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <p className="text-muted-foreground mb-4">
              Failed to load credit data
            </p>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!creditStatus) {
    return null
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const totalUsage = creditStatus.topUsers.reduce(
    (sum, user) => sum + (user.credits_used || 0),
    0
  )

  // Calculate burndown progress - how much balance is left relative to total available this cycle
  const totalAvailableThisCycle =
    creditStatus.currentBalance + creditStatus.usageThisCycle
  const usagePercentage =
    totalAvailableThisCycle > 0
      ? (creditStatus.usageThisCycle / totalAvailableThisCycle) * 100
      : 0

  // Define low balance threshold (same as typical auto-topup threshold)
  const LOW_BALANCE_THRESHOLD = 500
  const isLowBalance = creditStatus.currentBalance < LOW_BALANCE_THRESHOLD

  // Check if auto top-up is disabled and user can manage it
  const isAutoTopupDisabled = !orgSettings?.autoTopupEnabled
  const shouldShowAutoTopupBanner = isAutoTopupDisabled && canManageAutoTopup

  return (
    <Card
      className={noCardWrapper ? 'border-none shadow-none bg-transparent' : ''}
    >
      <CardHeader className={noCardWrapper ? 'p-0' : ''}>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center">
            <CreditCard className="mr-2 h-5 w-5" />
            Credit Monitor
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 w-8 p-0"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            />
          </Button>
        </CardTitle>
        {dataUpdatedAt && (
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
          </p>
        )}
      </CardHeader>
      <CardContent className={noCardWrapper ? 'p-0' : ''}>
        <div className="space-y-6">
          {/* Auto Top-up Disabled Banner */}
          {shouldShowAutoTopupBanner && orgSettings && (
            <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <AlertTriangle className="mr-3 h-5 w-5 text-amber-600 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-amber-800">
                      Auto Top-up Disabled
                    </h4>
                    <p className="text-sm text-amber-700">
                      Enable auto top-up to automatically purchase credits when
                      your balance runs low.
                    </p>
                  </div>
                </div>
                <Link href={`/orgs/${orgSettings.slug}/billing/purchase`}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-100"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Enable
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Credit Usage Progress */}
          <div
            className={`p-4 border rounded-lg ${isLowBalance ? 'border-red-200 bg-red-50' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className={`text-sm font-medium ${isLowBalance ? 'text-red-800' : ''}`}
              >
                Credits Used This Cycle
              </span>
              <span
                className={`text-xs ${isLowBalance ? 'text-red-600' : 'text-muted-foreground'}`}
              >
                {usagePercentage.toFixed(1)}% used
              </span>
            </div>
            <Progress
              value={usagePercentage}
              className={`h-3 mb-2 ${isLowBalance ? '[&>div]:bg-red-500' : ''}`}
            />
            <div className="flex justify-between text-xs">
              <span
                className={
                  isLowBalance ? 'text-red-600' : 'text-muted-foreground'
                }
              >
                {creditStatus.usageThisCycle.toLocaleString()} used
              </span>
              <span
                className={
                  isLowBalance ? 'text-red-600' : 'text-muted-foreground'
                }
              >
                {totalAvailableThisCycle.toLocaleString()} total
              </span>
            </div>
            {isLowBalance && (
              <div className="mt-3 p-2 bg-red-100 border border-red-200 rounded text-xs text-red-700">
                ⚠️ Low balance: {creditStatus.currentBalance.toLocaleString()}{' '}
                credits remaining
              </div>
            )}
          </div>

          {/* Top Users This Cycle */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center">
                <Users className="mr-2 h-5 w-5" />
                Top Users This Cycle
              </h3>
            </div>
            <div className="space-y-3">
              {creditStatus.topUsers.length > 0 ? (
                creditStatus.topUsers.map((user, index) => {
                  const creditsUsed = user.credits_used || 0
                  const percentage =
                    totalUsage > 0 ? (creditsUsed / totalUsage) * 100 : 0
                  return (
                    <div
                      key={user.user_id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-semibold text-sm">
                            #{index + 1}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-sm">
                            {user.user_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {user.user_email}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {creditsUsed.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>No usage data available for this cycle</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
