'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Zap,
  AlertTriangle,
  CheckCircle,
  Users,
  RefreshCw
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

interface CreditMonitorProps {
  organizationId: string
}

interface CreditStatus {
  currentBalance: number
  usageThisCycle: number
  usageToday: number
  topUsers: Array<{
    user_id: string
    user_name: string
    credits_used: number
  }>
  healthStatus: 'healthy' | 'warning' | 'critical'
  utilizationRate: number
}

const fetchCreditStatus = async (organizationId: string): Promise<CreditStatus> => {
  const response = await fetch(`/api/orgs/${organizationId}/usage`)
  
  if (!response.ok) {
    throw new Error('Failed to fetch credit status')
  }
  
  const data = await response.json()
  
  // Calculate health status
  let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy'
  if (data.currentBalance < 500) {
    healthStatus = 'critical'
  } else if (data.currentBalance < 2000) {
    healthStatus = 'warning'
  }

  // Calculate utilization rate
  const utilizationRate = data.currentBalance > 0 
    ? Math.min(100, (data.usageThisCycle / (data.currentBalance + data.usageThisCycle)) * 100)
    : 0

  // Get today's usage
  const today = new Date().toDateString()
  const usageToday = data.recentUsage
    ?.filter((usage: any) => new Date(usage.date).toDateString() === today)
    ?.reduce((sum: number, usage: any) => sum + usage.credits_used, 0) || 0

  return {
    currentBalance: data.currentBalance,
    usageThisCycle: data.usageThisCycle,
    usageToday,
    topUsers: data.topUsers || [],
    healthStatus,
    utilizationRate
  }
}

export function CreditMonitor({ organizationId }: CreditMonitorProps) {
  const {
    data: creditStatus,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt
  } = useQuery({
    queryKey: ['creditStatus', organizationId],
    queryFn: () => fetchCreditStatus(organizationId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })

  const getHealthIcon = () => {
    if (!creditStatus) return <Activity className="h-4 w-4" />
    
    switch (creditStatus.healthStatus) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const getHealthColor = () => {
    if (!creditStatus) return 'secondary'
    
    switch (creditStatus.healthStatus) {
      case 'healthy':
        return 'default'
      case 'warning':
        return 'secondary'
      case 'critical':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="mr-2 h-5 w-5" />
            Credit Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="mr-2 h-5 w-5" />
            Credit Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : 'Unable to load credit status'}
          </p>
          <Button onClick={() => refetch()} className="mt-2" variant="outline">
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!creditStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="mr-2 h-5 w-5" />
            Credit Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <Activity className="mr-2 h-5 w-5" />
            Credit Monitor
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Badge variant={getHealthColor()}>
              {getHealthIcon()}
              <span className="ml-1 capitalize">{creditStatus.healthStatus}</span>
            </Badge>
            <span className="text-xs text-muted-foreground">
              Updated {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : 'Never'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Balance */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Current Balance</span>
            <span className="text-2xl font-bold">
              {creditStatus.currentBalance.toLocaleString()}
            </span>
          </div>
          <Progress 
            value={Math.min(100, (creditStatus.currentBalance / 10000) * 100)} 
            className="h-2"
          />
        </div>

        {/* Usage Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center">
              <TrendingUp className="mr-1 h-3 w-3 text-blue-600" />
              <span className="text-xs text-muted-foreground">This Cycle</span>
            </div>
            <div className="text-lg font-semibold">
              {creditStatus.usageThisCycle.toLocaleString()}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center">
              <Zap className="mr-1 h-3 w-3 text-green-600" />
              <span className="text-xs text-muted-foreground">Today</span>
            </div>
            <div className="text-lg font-semibold">
              {creditStatus.usageToday.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Top Users Leaderboard */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center">
            <Users className="mr-1 h-4 w-4" />
            Top Users This Cycle
          </h4>
          <div className="space-y-2">
            {creditStatus.topUsers.length > 0 ? (
              creditStatus.topUsers.slice(0, 5).map((user, index) => {
                const percentage = creditStatus.usageThisCycle > 0 
                  ? (user.credits_used / creditStatus.usageThisCycle) * 100 
                  : 0
                
                return (
                  <div key={user.user_id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{user.user_name}</div>
                        <div className="text-muted-foreground">
                          {percentage.toFixed(1)}% of total usage
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {user.credits_used.toLocaleString()}
                    </Badge>
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-muted-foreground">No usage data available</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
