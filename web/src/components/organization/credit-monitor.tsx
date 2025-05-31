'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { RefreshCw, CreditCard, TrendingUp, Users, AlertTriangle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

interface CreditStatus {
  currentBalance: number
  usageThisCycle: number
  cycleStartDate: string
  cycleEndDate: string
  topUsers: Array<{
    user_id: string
    user_name: string
    credits_used: number
  }>
}

interface CreditMonitorProps {
  organizationId: string
  noCardWrapper?: boolean
}

async function fetchCreditStatus(organizationId: string): Promise<CreditStatus> {
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
      credits_used: user.credits_used || 0
    }))
  }
}

export function CreditMonitor({ organizationId, noCardWrapper }: CreditMonitorProps) {
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

  if (isLoading) {
    return (
      <Card className={noCardWrapper ? 'border-none shadow-none bg-transparent' : ''}>
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
      <Card className={noCardWrapper ? 'border-none shadow-none bg-transparent' : ''}>
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
            <p className="text-muted-foreground mb-4">Failed to load credit data</p>
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

  const totalUsage = creditStatus.topUsers.reduce((sum, user) => sum + (user.credits_used || 0), 0)

  // Calculate burndown progress - how much balance is left relative to total available this cycle
  const totalAvailableThisCycle = creditStatus.currentBalance + creditStatus.usageThisCycle
  const burndownPercentage = totalAvailableThisCycle > 0 
    ? (creditStatus.currentBalance / totalAvailableThisCycle) * 100 
    : 0

  return (
    <Card className={noCardWrapper ? 'border-none shadow-none bg-transparent' : ''}>
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
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
        {dataUpdatedAt && (
          <p className="text-xs text-muted-foreground">
            Updated at {new Date(dataUpdatedAt).toLocaleTimeString()}
          </p>
        )}
      </CardHeader>
      <CardContent className={noCardWrapper ? 'p-0' : ''}>
        <div className="space-y-6">
          {/* Usage Metrics - Merged with Current Balance */}
          <div className="grid grid-cols-1 gap-4">
            <div className="p-4 border rounded-lg">
              {/* Current Balance - now integrated and darkened */}
              <div className="mb-4 pb-4 border-b">
                <div className="text-sm text-muted-foreground mb-1">Current Balance</div>
                <div className="text-2xl font-bold text-blue-600">
                  {creditStatus.currentBalance.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">credits</div>
              </div>
              
              {/* Usage This Cycle */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Usage This Cycle</span>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <div className="text-2xl font-bold">
                {creditStatus.usageThisCycle.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(creditStatus.cycleStartDate)} - {formatDate(creditStatus.cycleEndDate)}
              </div>
            </div>

            {/* Credit Burndown Progress */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Credits Remaining</span>
                <span className="text-xs text-muted-foreground">
                  {burndownPercentage.toFixed(1)}% left
                </span>
              </div>
              <Progress 
                value={burndownPercentage} 
                className="h-3 mb-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{creditStatus.currentBalance.toLocaleString()} remaining</span>
                <span>{totalAvailableThisCycle.toLocaleString()} total</span>
              </div>
            </div>
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
                  const percentage = totalUsage > 0 ? (creditsUsed / totalUsage) * 100 : 0
                  return (
                    <div key={user.user_id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-semibold text-sm">
                            #{index + 1}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-sm">{user.user_name}</div>
                          <div className="text-xs text-muted-foreground">ID: {user.user_id}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{creditsUsed.toLocaleString()}</div>
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
