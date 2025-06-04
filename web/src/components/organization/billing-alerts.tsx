'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  AlertTriangle, 
  CheckCircle, 
  CreditCard, 
  TrendingUp,
  X
} from 'lucide-react'

interface BillingAlert {
  id: string
  type: 'low_balance' | 'high_usage' | 'auto_topup_failed' | 'credit_limit_reached'
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  timestamp: string
  dismissed?: boolean
}

interface BillingAlertsProps {
  organizationId: string
}

export function BillingAlerts({ organizationId }: BillingAlertsProps) {
  const [alerts, setAlerts] = useState<BillingAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAlerts()
    
    // Poll for new alerts every 30 seconds
    const interval = setInterval(fetchAlerts, 30000)
    return () => clearInterval(interval)
  }, [organizationId])

  const fetchAlerts = async () => {
    try {
      const response = await fetch(`/api/orgs/${organizationId}/alerts`)
      
      if (response.ok) {
        const data = await response.json()
        setAlerts(data.alerts || [])
      }
    } catch (error) {
      console.error('Error fetching billing alerts:', error)
    } finally {
      setLoading(false)
    }
  }

  const dismissAlert = async (alertId: string) => {
    try {
      await fetch(`/api/orgs/${organizationId}/alerts/${alertId}/dismiss`, {
        method: 'POST',
      })
      
      setAlerts(alerts.filter(alert => alert.id !== alertId))
    } catch (error) {
      console.error('Error dismissing alert:', error)
    }
  }

  const getAlertIcon = (type: string, severity: string) => {
    if (severity === 'critical') {
      return <AlertTriangle className="h-4 w-4 text-red-600" />
    } else if (severity === 'warning') {
      return <AlertTriangle className="h-4 w-4 text-yellow-600" />
    } else if (type === 'high_usage') {
      return <TrendingUp className="h-4 w-4 text-blue-600" />
    } else if (type === 'auto_topup_failed') {
      return <CreditCard className="h-4 w-4 text-red-600" />
    }
    return <CheckCircle className="h-4 w-4 text-green-600" />
  }

  const getAlertColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive'
      case 'warning':
        return 'secondary'
      default:
        return 'default'
    }
  }

  if (loading) {
    return null
  }

  const activeAlerts = alerts.filter(alert => !alert.dismissed)

  if (activeAlerts.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {activeAlerts.map((alert) => (
        <Card key={alert.id} className={`border-l-4 ${
          alert.severity === 'critical' ? 'border-l-red-500' :
          alert.severity === 'warning' ? 'border-l-yellow-500' :
          'border-l-blue-500'
        }`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {getAlertIcon(alert.type, alert.severity)}
                <CardTitle className="text-sm font-medium">
                  {alert.title}
                </CardTitle>
                <Badge variant={getAlertColor(alert.severity)} className="text-xs">
                  {alert.severity}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismissAlert(alert.id)}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-2">
              {alert.message}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(alert.timestamp).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
