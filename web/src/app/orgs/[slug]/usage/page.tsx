'use client'

import { pluralize } from '@codebuff/common/util/string'
import {
  ArrowLeft,
  TrendingUp,
  Users,
  GitBranch,
  CreditCard,
  Calendar,
  Download,
  AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'
import { useOrganizationData } from '@/hooks/use-organization-data'

interface UsageData {
  currentBalance: number
  usageThisCycle: number
  topUsers: Array<{
    user_id: string
    user_name: string
    user_email: string
    credits_used: number
  }>
  recentUsage: Array<{
    date: string
    credits_used: number
    repository_url: string
    user_name: string
  }>
}

export default function UsagePage() {
  const { data: session, status } = useSession()
  const params = useParams() ?? {}
  const router = useRouter()
  const orgSlug = (params.slug as string) ?? ''

  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [usageLoading, setUsageLoading] = useState(true)
  const [usageError, setUsageError] = useState<string | null>(null)

  // Use the custom hook for organization data
  const { organization, isLoading, error } = useOrganizationData(orgSlug)

  useEffect(() => {
    if (organization) {
      fetchUsageData()
    }
  }, [organization])

  const fetchUsageData = async () => {
    if (!organization) return

    try {
      setUsageLoading(true)
      const response = await fetch(`/api/orgs/${organization.id}/usage`)

      if (response.ok) {
        const usage = await response.json()
        setUsageData(usage)
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch usage data')
      }
    } catch (error) {
      console.error('Error fetching usage data:', error)
      setUsageError(
        error instanceof Error ? error.message : 'Failed to load usage data',
      )
    } finally {
      setUsageLoading(false)
    }
  }

  const handleExportUsage = async () => {
    if (!organization) return

    try {
      const response = await fetch(`/api/orgs/${organization.id}/usage/export`)

      if (!response.ok) {
        throw new Error('Failed to export usage data')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = `${organization.name}-usage-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'Success',
        description: 'Usage data exported successfully',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to export usage data',
        variant: 'destructive',
      })
    }
  }

  if (status === 'loading' || isLoading || usageLoading) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-96" />
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
              <p className="mb-4">Please sign in to view usage analytics.</p>
              <Link href="/login">
                <Button>Sign In</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error || usageError || !organization) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-red-600">
                <AlertTriangle className="mr-2 h-5 w-5" />
                Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                {error || usageError || 'Organization not found'}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => router.back()} variant="outline">
                  Go Back
                </Button>
                <Button onClick={fetchUsageData}>Try Again</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const canViewUsage =
    organization.userRole === 'owner' || organization.userRole === 'admin'

  if (!canViewUsage) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                You don't have permission to view usage analytics for this
                organization.
              </p>
              <Link href={`/orgs/${orgSlug}`}>
                <Button>Back to Organization</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const utilizationRate = usageData?.currentBalance
    ? Math.min(
        100,
        (usageData.usageThisCycle /
          (usageData.currentBalance + usageData.usageThisCycle)) *
          100,
      )
    : 0

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <Link href={`/orgs/${orgSlug}`}>
              <Button variant="ghost" size="sm" className="mr-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to {organization.name}
              </Button>
            </Link>
          </div>
          <Button onClick={handleExportUsage} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Usage
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Usage Analytics</h1>
          <p className="text-muted-foreground mt-2">
            Credit usage and billing insights for {organization.name}
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
                {usageData?.currentBalance?.toLocaleString() || '—'}
              </div>
              <p className="text-xs text-muted-foreground">Available credits</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Usage This Cycle
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {usageData?.usageThisCycle?.toLocaleString() || '—'}
              </div>
              <p className="text-xs text-muted-foreground">Credits consumed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Users
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {usageData?.topUsers?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {pluralize(usageData?.topUsers?.length || 0, 'user')} with usage
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Utilization Rate
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {utilizationRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Of available credits
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Usage Breakdown */}
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
                {usageData?.topUsers?.length ? (
                  usageData.topUsers.map((user, index) => (
                    <div
                      key={user.user_id}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium">{user.user_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {user.credits_used.toLocaleString()} credits
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {(
                          (user.credits_used /
                            (usageData.usageThisCycle || 1)) *
                          100
                        ).toFixed(1)}
                        %
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No usage data available</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <GitBranch className="mr-2 h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {usageData?.recentUsage?.length ? (
                  usageData.recentUsage.slice(0, 10).map((usage, index) => {
                    let repoPath = 'N/A'
                    if (usage.repository_url) {
                      try {
                        repoPath = new URL(usage.repository_url).pathname.slice(
                          1,
                        )
                      } catch (e) {
                        // If URL is invalid, repoPath remains 'N/A'
                        console.warn(
                          `Invalid repository_url: ${usage.repository_url}`,
                          e,
                        )
                      }
                    }
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium">{usage.user_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {repoPath}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(usage.date).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {usage.credits_used.toLocaleString()}
                        </Badge>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <GitBranch className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No recent activity</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Credit Health Alert */}
        {usageData && usageData.currentBalance < 1000 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center text-orange-800">
                <AlertTriangle className="mr-2 h-5 w-5" />
                Low Credit Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-orange-700 mb-4">
                Your organization has a low credit balance. Consider purchasing
                more credits to avoid service interruption.
              </p>
              <Link href={`/orgs/${orgSlug}`}>
                <Button className="bg-orange-600 hover:bg-orange-700">
                  Purchase Credits
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
