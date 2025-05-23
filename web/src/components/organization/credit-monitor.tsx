'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Zap,
  AlertTriangle,
  CheckCircle
} from 'lucide-react'

interface CreditMonitorProps {
  organizationId: string
  refreshInterval?: number // in milliseconds
}

interface CreditStatus {
  currentBalance: number
  usageThisCycle: number
  usageToday: number
  recentActivity: Array<{
    timestamp: string
    user_name: string
    credits_used: number
    repository_url: string
  }>
  healthStatus: 'healthy' | 'warning' | 'critical'
  utilizationRate: number
}

export function CreditMonitor({ organizationId, refreshInterval = 30000 }: CreditMonitorProps) {
  const [creditStatus, setCreditStatus] = useState<CreditStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  useEffect(() => {
    fetchCreditStatus()
    
    const interval = setInterval(() => {
      fetchCreditStatus()
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [organizationId, refreshInterval])

  const fetchCreditStatus = async () => {
    try {
      const response = await fetch(`/api/orgs/${organizationId}/usage`)
      
      if (response.ok) {
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

        setCreditStatus({
          currentBalance: data.currentBalance,
          usageThisCycle: data.usageThisCycle,
          usageToday,
          recentActivity: data.recentUsage?.slice(0, 5) || [],
          healthStatus,
          utilizationRate
        })
        
        setLastUpdate(new Date())
      }
    } catch (error) {
      console.error('Error fetching credit status:', error)
    } finally {
      setLoading(false)
    }
  }

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

  if (loading) {
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
          <p className="text-muted-foreground">Unable to load credit status</p>
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
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
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

        {/* Utilization Rate */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Utilization Rate</span>
            <span className="text-sm font-semibold">
              {creditStatus.utilizationRate.toFixed(1)}%
            </span>
          </div>
          <Progress 
            value={creditStatus.utilizationRate} 
            className="h-2"
          />
        </div>

        {/* Recent Activity */}
        <div>
          <h4 className="text-sm font-medium mb-3">Recent Activity</h4>
          <div className="space-y-2">
            {creditStatus.recentActivity.length > 0 ? (
              creditStatus.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center justify-between text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{activity.user_name}</div>
                    <div className="text-muted-foreground truncate">
                      {new URL(activity.repository_url).pathname.slice(1)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Badge variant="outline" className="text-xs">
                      {activity.credits_used}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(activity.timestamp).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No recent activity</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
