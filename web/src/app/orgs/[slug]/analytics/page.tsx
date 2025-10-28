'use client'

import { pluralize } from '@codebuff/common/util/string'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Users,
  GitBranch,
  CreditCard,
  Calendar,
  Download,
  BarChart3,
  PieChart,
  Activity,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'
import { useOrganizationData } from '@/hooks/use-organization-data'

interface AnalyticsData {
  currentBalance: number
  usageThisCycle: number
  usageTrend: {
    period: string
    usage: number
    change: number
  }[]
  topUsers: {
    user_id: string
    user_name: string
    credits_used: number
    percentage: number
  }[]
  repositoryUsage: {
    repository_url: string
    repository_name: string
    credits_used: number
    percentage: number
  }[]
  dailyUsage: {
    date: string
    credits_used: number
  }[]
  costProjection: {
    currentMonthProjected: number
    nextMonthEstimate: number
    averageDaily: number
  }
}

export default function OrganizationAnalyticsPage() {
  const { data: session, status } = useSession()
  const params = useParams() ?? {}
  const router = useRouter()
  const orgSlug = (params.slug ?? '') as string

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

  // Use the custom hook for organization data
  const { organization, isLoading, error } = useOrganizationData(orgSlug)

  useEffect(() => {
    if (organization) {
      fetchAnalytics()
    }
  }, [organization])

  const fetchAnalytics = async () => {
    if (!organization) return

    try {
      setAnalyticsLoading(true)
      const response = await fetch(`/api/orgs/${organization.id}/analytics`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch analytics')
      }

      const data = await response.json()
      setAnalytics(data)
    } catch (error) {
      console.error('Error fetching analytics:', error)
      setAnalyticsError(
        error instanceof Error ? error.message : 'Failed to load analytics',
      )
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const exportData = async (format: 'csv' | 'json') => {
    if (!organization) return

    try {
      const response = await fetch(
        `/api/orgs/${organization.id}/analytics/export?format=${format}`,
      )

      if (!response.ok) {
        throw new Error('Failed to export data')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `org-${organization.id}-analytics.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'Success',
        description: `Analytics data exported as ${format.toUpperCase()}`,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to export analytics data',
        variant: 'destructive',
      })
    }
  }

  if (status === 'loading' || isLoading || analyticsLoading) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-2 mb-8">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Sign in Required</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                Please sign in to view organization analytics.
              </p>
              <Link href="/login">
                <Button>Sign In</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error || analyticsError || !analytics) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                {error || analyticsError || 'Analytics data not found'}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => router.back()} variant="outline">
                  Go Back
                </Button>
                <Button onClick={fetchAnalytics}>Try Again</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <Link href={`/orgs/${orgSlug}`}>
              <Button variant="ghost" size="sm" className="mr-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Organization
              </Button>
            </Link>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => exportData('csv')}
              variant="outline"
              size="sm"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              onClick={() => exportData('json')}
              variant="outline"
              size="sm"
            >
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
          </div>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center">
            <BarChart3 className="mr-3 h-8 w-8" />
            Analytics Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive insights into your organization's credit usage and
            trends
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Current Balance
              </CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics.currentBalance.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                {pluralize(analytics.currentBalance, 'credit')} remaining
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Usage This Cycle
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics.usageThisCycle.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                {pluralize(analytics.usageThisCycle, 'credit')} consumed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Daily Average
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics.costProjection.averageDaily.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                {pluralize(analytics.costProjection.averageDaily, 'credit')} per
                day
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Monthly Projection
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {analytics.costProjection.currentMonthProjected.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Estimated total</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts and Analytics */}
        <div className="grid gap-6 md:grid-cols-2 mb-8">
          {/* Top Users */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="mr-2 h-5 w-5" />
                Top Users This Cycle
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.topUsers.slice(0, 5).map((user, index) => (
                  <div
                    key={user.user_id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{user.user_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {user.percentage.toFixed(1)}% of total usage
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {user.credits_used.toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {pluralize(user.credits_used, 'credit')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Repository Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <GitBranch className="mr-2 h-5 w-5" />
                Repository Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.repositoryUsage.slice(0, 5).map((repo, index) => (
                  <div
                    key={repo.repository_url}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {repo.repository_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {repo.percentage.toFixed(1)}% of total usage
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {repo.credits_used.toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {pluralize(repo.credits_used, 'credit')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage Trends */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="mr-2 h-5 w-5" />
              Usage Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.usageTrend.map((trend, index) => (
                <div
                  key={trend.period}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{trend.period}</p>
                    <p className="text-sm text-muted-foreground">
                      {trend.usage.toLocaleString()}{' '}
                      {pluralize(trend.usage, 'credit')} used
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {trend.change > 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : trend.change < 0 ? (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    ) : null}
                    <span
                      className={`text-sm font-medium ${
                        trend.change > 0
                          ? 'text-green-600'
                          : trend.change < 0
                            ? 'text-red-600'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {trend.change > 0 ? '+' : ''}
                      {trend.change.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Daily Usage Chart Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <PieChart className="mr-2 h-5 w-5" />
              Daily Usage Pattern
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Interactive charts coming soon
                </p>
                <p className="text-sm text-muted-foreground">
                  Daily usage data: {analytics.dailyUsage.length}{' '}
                  {pluralize(analytics.dailyUsage.length, 'day')} tracked
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
