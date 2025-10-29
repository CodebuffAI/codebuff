'use client'

import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Zap,
  Shield,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { pluralize } from '@codebuff/common/util/string'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

interface MonitoringData {
  healthStatus: 'healthy' | 'warning' | 'critical'
  creditVelocity: {
    current: number
    trend: 'up' | 'down' | 'stable'
    percentage: number
  }
  burnRate: {
    daily: number
    weekly: number
    monthly: number
    daysRemaining: number
  }
  performanceMetrics: {
    responseTime: number
    errorRate: number
    uptime: number
  }
  alerts: {
    active: number
    critical: number
    warnings: number
  }
}

interface AdvancedMonitorProps {
  orgId: string
  refreshInterval?: number
}

export function AdvancedMonitor({
  orgId,
  refreshInterval = 30000,
}: AdvancedMonitorProps) {
  const [data, setData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchMonitoringData = async () => {
    try {
      const response = await fetch(`/api/orgs/${orgId}/monitoring`)
      if (response.ok) {
        const monitoringData = await response.json()
        setData(monitoringData)
        setLastUpdated(new Date())
      }
    } catch (error) {
      console.error('Error fetching monitoring data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMonitoringData()
    const interval = setInterval(fetchMonitoringData, refreshInterval)
    return () => clearInterval(interval)
  }, [orgId, refreshInterval])

  const getHealthStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
      case 'critical':
        return <AlertTriangle className="h-5 w-5 text-red-600" />
      default:
        return <Activity className="h-5 w-5 text-gray-600" />
    }
  }

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-red-600" />
      case 'down':
        return <TrendingDown className="h-4 w-4 text-green-600" />
      default:
        return <Activity className="h-4 w-4 text-gray-600" />
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="mr-2 h-5 w-5" />
            Advanced Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="mr-2 h-5 w-5" />
            Advanced Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Monitoring data unavailable</p>
          <Button onClick={fetchMonitoringData} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Health Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Shield className="mr-2 h-5 w-5" />
              System Health
            </div>
            <div className="flex items-center space-x-2">
              {lastUpdated && (
                <span className="text-xs text-muted-foreground">
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
              <Button onClick={fetchMonitoringData} size="sm" variant="outline">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            {getHealthStatusIcon(data.healthStatus)}
            <div>
              <Badge className={getHealthStatusColor(data.healthStatus)}>
                {data.healthStatus.toUpperCase()}
              </Badge>
              <p className="text-sm text-muted-foreground mt-1">
                Overall system status
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit Velocity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Zap className="mr-2 h-5 w-5" />
            Credit Velocity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Current Rate</span>
              <div className="flex items-center space-x-2">
                {getTrendIcon(data.creditVelocity.trend)}
                <span className="text-lg font-bold">
                  {pluralize(data.creditVelocity.current, 'credit')}/hour
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {data.creditVelocity.trend === 'up'
                  ? 'Increase'
                  : data.creditVelocity.trend === 'down'
                    ? 'Decrease'
                    : 'No change'}{' '}
                from last period
              </span>
              <span
                className={`text-sm font-medium ${
                  data.creditVelocity.trend === 'up'
                    ? 'text-red-600'
                    : data.creditVelocity.trend === 'down'
                      ? 'text-green-600'
                      : 'text-gray-600'
                }`}
              >
                {data.creditVelocity.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Burn Rate Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="mr-2 h-5 w-5" />
            Burn Rate Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {data.burnRate.daily.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pluralize(data.burnRate.daily, 'credit')} daily
                </p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {data.burnRate.weekly.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pluralize(data.burnRate.weekly, 'credit')} weekly
                </p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {data.burnRate.monthly.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pluralize(data.burnRate.monthly, 'credit')} monthly
                </p>
              </div>
            </div>
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Credits Remaining</span>
                <span className="text-lg font-bold">
                  {pluralize(data.burnRate.daysRemaining, 'day')}
                </span>
              </div>
              <Progress
                value={Math.max(
                  0,
                  Math.min(100, (data.burnRate.daysRemaining / 30) * 100),
                )}
                className="mt-2"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="mr-2 h-5 w-5" />
            Performance Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Response Time</span>
              <span className="text-lg font-bold">
                {data.performanceMetrics.responseTime}ms
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Error Rate</span>
              <span className="text-lg font-bold">
                {data.performanceMetrics.errorRate.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Uptime</span>
              <span className="text-lg font-bold">
                {data.performanceMetrics.uptime.toFixed(1)}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertTriangle className="mr-2 h-5 w-5" />
            Active Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">
                {data.alerts.critical}
              </p>
              <p className="text-xs text-muted-foreground">
                {pluralize(data.alerts.critical, 'Critical Alert')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">
                {data.alerts.warnings}
              </p>
              <p className="text-xs text-muted-foreground">
                {pluralize(data.alerts.warnings, 'Warning')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{data.alerts.active}</p>
              <p className="text-xs text-muted-foreground">
                {pluralize(data.alerts.active, 'Alert')} Total
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
