'use client'

import {
  BarChart3,
  Download,
  TrendingUp,
  TrendingDown,
  DollarSign,
} from 'lucide-react'
import { useState, useEffect } from 'react'

import { pluralize } from '@codebuff/common/util/string'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface BillingReport {
  period: string
  totalCreditsUsed: number
  totalCost: number
  averageDailyCost: number
  topUsers: Array<{
    name: string
    email: string
    creditsUsed: number
    percentage: number
  }>
  topRepositories: Array<{
    name: string
    creditsUsed: number
    percentage: number
  }>
  dailyUsage: Array<{
    date: string
    credits: number
    cost: number
  }>
  monthlyTrend: {
    direction: 'up' | 'down' | 'stable'
    percentage: number
  }
}

interface BillingReportsProps {
  organizationId: string
}

export function BillingReports({ organizationId }: BillingReportsProps) {
  const [report, setReport] = useState<BillingReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState('current_month')

  useEffect(() => {
    fetchReport()
  }, [organizationId, selectedPeriod])

  const fetchReport = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `/api/orgs/${organizationId}/reports/billing?period=${selectedPeriod}`,
      )

      if (response.ok) {
        const data = await response.json()
        setReport(data)
      }
    } catch (error) {
      console.error('Error fetching billing report:', error)
    } finally {
      setLoading(false)
    }
  }

  const exportReport = async () => {
    try {
      const response = await fetch(
        `/api/orgs/${organizationId}/reports/billing/export?period=${selectedPeriod}`,
      )

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `billing-report-${selectedPeriod}-${new Date().toISOString().split('T')[0]}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Error exporting report:', error)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart3 className="mr-2 h-5 w-5" />
            Billing Reports
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

  if (!report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart3 className="mr-2 h-5 w-5" />
            Billing Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No billing data available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <BarChart3 className="mr-2 h-5 w-5" />
              Billing Reports
            </CardTitle>
            <div className="flex items-center space-x-2">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="px-3 py-1 border rounded-md text-sm"
              >
                <option value="current_month">Current Month</option>
                <option value="last_month">Last Month</option>
                <option value="last_3_months">Last 3 Months</option>
                <option value="last_6_months">Last 6 Months</option>
              </select>
              <Button variant="outline" size="sm" onClick={exportReport}>
                <Download className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {report.totalCreditsUsed.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">
                {pluralize(report.totalCreditsUsed, 'Credit')}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                ${report.totalCost.toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">Total Cost</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                ${report.averageDailyCost.toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">
                Avg Daily Cost
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1">
                {report.monthlyTrend.direction === 'up' ? (
                  <TrendingUp className="h-4 w-4 text-red-600" />
                ) : report.monthlyTrend.direction === 'down' ? (
                  <TrendingDown className="h-4 w-4 text-green-600" />
                ) : (
                  <DollarSign className="h-4 w-4 text-gray-600" />
                )}
                <span className="text-lg font-bold">
                  {report.monthlyTrend.percentage.toFixed(1)}%
                </span>
              </div>
              <div className="text-sm text-muted-foreground">Monthly Trend</div>
            </div>
          </div>

          {/* Top Users */}
          <div>
            <h4 className="font-medium mb-3">
              Top {pluralize(report.topUsers.length, 'User')} by Usage
            </h4>
            <div className="space-y-2">
              {report.topUsers.slice(0, 5).map((user, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{user.name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {user.email}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs">
                      {user.creditsUsed.toLocaleString()}
                    </Badge>
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {user.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Repositories */}
          <div>
            <h4 className="font-medium mb-3">
              Top {pluralize(report.topRepositories.length, 'Repository')} by
              Usage
            </h4>
            <div className="space-y-2">
              {report.topRepositories.slice(0, 5).map((repo, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{repo.name}</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs">
                      {repo.creditsUsed.toLocaleString()}
                    </Badge>
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {repo.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Usage Chart */}
          <div>
            <h4 className="font-medium mb-3">Daily Usage Trend</h4>
            <div className="h-32 flex items-end space-x-1">
              {report.dailyUsage.slice(-14).map((day, index) => {
                const maxCredits = Math.max(
                  ...report.dailyUsage.map((d) => d.credits),
                )
                const height =
                  maxCredits > 0 ? (day.credits / maxCredits) * 100 : 0

                return (
                  <div
                    key={index}
                    className="flex-1 flex flex-col items-center"
                  >
                    <div
                      className="w-full bg-blue-500 rounded-t"
                      style={{ height: `${height}%` }}
                      title={`${day.date}: ${day.credits} credits`}
                    />
                    <div className="text-xs text-muted-foreground mt-1 transform -rotate-45 origin-top-left">
                      {new Date(day.date).getDate()}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
