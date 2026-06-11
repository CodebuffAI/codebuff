'use client'

import { api } from '@/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useSignedInUser } from '@/vly/hooks/use-user'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/vly/components/ui/card'
import { Badge } from '@/vly/components/ui/badge'
import { Button } from '@/vly/components/ui/button'
import { Skeleton } from '@/vly/components/ui/skeleton'
import { CountUp } from '@/vly/components/CountUp'
import { Confetti } from '@/vly/components/Confetti'
import { useCountCelebration } from '@/vly/hooks/use-count-celebration'
import { useState, useEffect } from 'react'
import { Id } from '@/convex/_generated/dataModel'
import {
  Users,
  FolderOpen,
  TrendingUp,
  Activity,
  Zap,
  AlertTriangle,
  CheckCircle,
  Mail,
  UserPlus,
  Ticket,
  BarChart3,
  Search,
} from 'lucide-react'
import { AdminNavbar } from '@/vly/components/AdminNavbar'
import { AdminProjectOwnershipManager } from '@/vly/components/admin/AdminProjectOwnershipManager'
import { TicketsView } from '@/vly/components/pages/TicketsView'
import { AdminIntegrationsView } from '@/vly/components/pages/AdminIntegrationsView'
import TicketDetailDialog from '@/vly/components/TicketDetailDialog'
import { IntegrationApprovalDialog } from '@/vly/components/IntegrationApprovalDialog'
import TimeRangeSelector from '@/vly/components/project-2/monitoring/shared/TimeRangeSelector'
import { useTimeRange } from '@/vly/hooks/useTimeRange'

export default function AdminDashboard() {
  const user = useSignedInUser()
  const isAdmin = user?.role === 'god' || user?.role === 'admin'
  const [activeView, setActiveView] = useState<
    'admin' | 'tickets' | 'integrations'
  >('admin')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [integrationStatusFilter, setIntegrationStatusFilter] =
    useState<string>('pending')
  const [isUpdatingDaytonaMigrationToggle, setIsUpdatingDaytonaMigrationToggle] =
    useState(false)
  const [isUpdatingBrandingInjectionToggle, setIsUpdatingBrandingInjectionToggle] =
    useState(false)
  const [selectedTicketId, setSelectedTicketId] =
    useState<Id<'tickets'> | null>(null)
  const [selectedIntegration, setSelectedIntegration] = useState<any | null>(
    null,
  )

  const timeRangeHook = useTimeRange('24h')

  // Bump every minute so the "past hour" live-user window advances even
  // without data changes (Convex queries don't re-run on wall-clock time).
  const [engagementRefreshKey, setEngagementRefreshKey] = useState(0)
  useEffect(() => {
    const interval = setInterval(
      () => setEngagementRefreshKey((k) => k + 1),
      60_000,
    )
    return () => clearInterval(interval)
  }, [])

  const engagementStats = useQuery(
    api.activity.getEngagementStats,
    isAdmin ? { refreshKey: engagementRefreshKey, historyDays: 30 } : 'skip',
  )

  const dashboardStats = useQuery(
    api.admin_stats.getDashboardStats,
    isAdmin && timeRangeHook.timeRangeValues
      ? {
          startTime: timeRangeHook.timeRangeValues.startTime,
          endTime: timeRangeHook.timeRangeValues.endTime,
        }
      : 'skip',
  )
  const liveActivity = useQuery(
    api.admin_stats.getLiveActivityStream,
    isAdmin && timeRangeHook.timeRangeValues
      ? {
          startTime: timeRangeHook.timeRangeValues.startTime,
          endTime: timeRangeHook.timeRangeValues.endTime,
        }
      : 'skip',
  )
  const daytonaMigrationEnabled = useQuery(api.settings.get, {
    key: 'daytona_migration_enabled',
    defaultValue: true,
  })
  const prodBrandingInjectionEnabled = useQuery(api.settings.get, {
    key: 'prod_branding_injection_enabled',
    defaultValue: true,
  })
  const updateSetting = useMutation(api.settings.update)

  const toggleDaytonaMigration = async () => {
    if (daytonaMigrationEnabled === undefined) {
      return
    }

    setIsUpdatingDaytonaMigrationToggle(true)
    try {
      await updateSetting({
        key: 'daytona_migration_enabled',
        value: !daytonaMigrationEnabled,
      })
    } finally {
      setIsUpdatingDaytonaMigrationToggle(false)
    }
  }

  const toggleProdBrandingInjection = async () => {
    if (prodBrandingInjectionEnabled === undefined) {
      return
    }

    setIsUpdatingBrandingInjectionToggle(true)
    try {
      await updateSetting({
        key: 'prod_branding_injection_enabled',
        value: !prodBrandingInjectionEnabled,
      })
    } finally {
      setIsUpdatingBrandingInjectionToggle(false)
    }
  }

  // Celebration effects for project count changes
  const { showConfetti, resetConfetti } = useCountCelebration({
    projectCount: dashboardStats?.totals.projects,
    enabled: true,
  })

  // Debug logging
  useEffect(() => {
    console.log('Admin Dashboard - showConfetti:', showConfetti)
    console.log(
      'Admin Dashboard - projectCount:',
      dashboardStats?.totals.projects,
    )
  }, [dashboardStats?.totals.users, dashboardStats?.totals.projects])

  // Handle tab change from navbar
  const handleTabChange = (tab: string) => {
    if (tab === 'tickets') {
      setActiveView('tickets')
    } else if (tab === 'integrations') {
      setActiveView('integrations')
    } else {
      setActiveView('admin')
    }
  }

  // Wait for user to load so role changes trigger a re-render
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-white p-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 text-center text-black">
            <Skeleton className="mx-auto mb-4 h-8 w-80" />
            <Skeleton className="mx-auto h-4 w-48" />
          </div>
        </div>
      </div>
    )
  }

  // Check if user has admin access
  if (user === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center text-black">
          <h1 className="mb-4 text-4xl font-bold">Access Denied</h1>
          <p className="text-xl">Please sign in to continue</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center text-black">
          <AlertTriangle className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h1 className="mb-4 text-4xl font-bold">Access Restricted</h1>
          <p className="text-xl">Admin Access Required</p>
        </div>
      </div>
    )
  }

  if (!dashboardStats) {
    return (
      <div className="min-h-screen bg-white p-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 text-center text-black">
            <Skeleton className="mx-auto mb-4 h-8 w-80" />
            <Skeleton className="mx-auto h-4 w-48" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card
                key={i}
                className="border border-gray-200 bg-white shadow-sm"
              >
                <CardContent className="p-4">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user_signup':
        return <UserPlus className="h-4 w-4" />
      case 'ticket_created':
        return <Ticket className="h-4 w-4" />
      case 'email_blast_sent':
        return <Mail className="h-4 w-4" />
      case 'message':
        return <Zap className="h-4 w-4" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'message':
        return 'bg-gray-50 text-black border-gray-200'
      case 'user_signup':
        return 'bg-blue-50 text-black border-blue-200'
      case 'ticket_created':
        return 'bg-amber-50 text-black border-amber-200'
      case 'email_blast_sent':
        return 'bg-gray-50 text-black border-gray-200'
      default:
        return 'bg-gray-50 text-black border-gray-200'
    }
  }

  const getActivityLabel = (type: string) => {
    switch (type) {
      case 'user_signup':
        return 'User Signup'
      case 'ticket_created':
        return 'Ticket Created'
      case 'email_blast_sent':
        return 'Email Blast Sent'
      default:
        return type.replaceAll('_', ' ')
    }
  }

  const getActivityDescription = (activity: any) => {
    if (activity.type === 'user_signup') {
      const name = activity.data?.name || 'New user'
      const email = activity.data?.email || 'unknown'
      return `${name} (${email})`
    }

    if (activity.type === 'ticket_created') {
      return `Project: ${activity.data?.projectId} • Status: ${activity.data?.status}`
    }

    if (activity.type === 'email_blast_sent') {
      return `${activity.data?.sentCount ?? 0}/${activity.data?.recipientCount ?? 0} delivered`
    }

    if (activity.type === 'message') {
      return `Project: ${activity.data?.project_id}`
    }

    return ''
  }

  // Render different views based on activeView
  const renderContent = () => {
    if (activeView === 'tickets') {
      return (
        <div className="mx-auto max-w-7xl px-8 py-12">
          <TicketsView
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            setSelectedTicketId={setSelectedTicketId}
          />
        </div>
      )
    }

    if (activeView === 'integrations') {
      return (
        <div className="mx-auto max-w-7xl px-8 py-12">
          <AdminIntegrationsView
            integrationStatusFilter={integrationStatusFilter}
            setIntegrationStatusFilter={setIntegrationStatusFilter}
            setSelectedIntegration={setSelectedIntegration}
          />
        </div>
      )
    }

    // Default Admin Stats View
    return (
      <div className="mx-auto max-w-6xl p-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-black">
            ADMIN DASHBOARD
          </h1>
          <p className="text-sm text-gray-600">System Analytics</p>
          <div className="mt-2 flex items-center justify-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-600">Active</span>
          </div>
          <div className="mt-4 flex items-center justify-center gap-4">
            <a
              href="/web/admin/referrals"
              className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
            >
              <TrendingUp className="h-4 w-4" />
              Manage Referrals
            </a>
            <a
              href="/web/admin/referral-lookup"
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-50"
            >
              <Search className="h-4 w-4" />
              Referral Lookup
            </a>
            <a
              href="/web/admin/resource-usage"
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-50"
            >
              <BarChart3 className="h-4 w-4" />
              Platform Usage
            </a>
          </div>
          <div className="mt-4 flex justify-center">
            <TimeRangeSelector
              timeRange={timeRangeHook.timeRange}
              setTimeRange={timeRangeHook.setTimeRange}
              customStartDate={timeRangeHook.customStartDate}
              setCustomStartDate={timeRangeHook.setCustomStartDate}
              customEndDate={timeRangeHook.customEndDate}
              setCustomEndDate={timeRangeHook.setCustomEndDate}
            />
          </div>
        </div>

        <div className="mb-8">
          <AdminProjectOwnershipManager />
        </div>

        {/* Engagement Grid */}
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Live Users (past hour) */}
          <Card className="border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Live Users (past hour)
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <CountUp
                      end={engagementStats?.live.usersPastHour ?? 0}
                      className="text-2xl font-bold text-black"
                    />
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Unique users who sent a message in the last 60 min
                  </p>
                </div>
                <div className="rounded-full bg-green-50 p-2">
                  <Activity className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Today (DAU) */}
          <Card className="border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Active Today (DAU)
                  </p>
                  <div className="mt-1 flex items-center">
                    <CountUp
                      end={engagementStats?.today.activeUsers ?? 0}
                      className="text-2xl font-bold text-black"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Unique users who sent a message today (UTC)
                  </p>
                </div>
                <div className="rounded-full bg-gray-100 p-2">
                  <Zap className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="mb-8 border border-gray-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-black">
              <Zap className="h-5 w-5 text-gray-600" />
              Migration Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-black">Daytona Migration</p>
                <p className="text-xs text-gray-600">
                  Global switch for legacy Daytona migration across all projects.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  className={
                    daytonaMigrationEnabled
                      ? 'border-green-200 bg-green-100 text-green-700'
                      : 'border-gray-200 bg-gray-100 text-gray-700'
                  }
                >
                  {daytonaMigrationEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    daytonaMigrationEnabled === undefined ||
                    isUpdatingDaytonaMigrationToggle
                  }
                  onClick={toggleDaytonaMigration}
                >
                  {isUpdatingDaytonaMigrationToggle
                    ? 'Updating...'
                    : daytonaMigrationEnabled
                      ? 'Turn Off'
                      : 'Turn On'}
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-black">Prod Branding Injection</p>
                <p className="text-xs text-gray-600">
                  Global switch for applying branding to `dist/index.html` on prod deploy.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  className={
                    prodBrandingInjectionEnabled
                      ? 'border-green-200 bg-green-100 text-green-700'
                      : 'border-gray-200 bg-gray-100 text-gray-700'
                  }
                >
                  {prodBrandingInjectionEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    prodBrandingInjectionEnabled === undefined ||
                    isUpdatingBrandingInjectionToggle
                  }
                  onClick={toggleProdBrandingInjection}
                >
                  {isUpdatingBrandingInjectionToggle
                    ? 'Updating...'
                    : prodBrandingInjectionEnabled
                      ? 'Turn Off'
                      : 'Turn On'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Users */}
          <Card className="border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Total Users
                  </p>
                  <div className="mt-1 flex items-center">
                    <CountUp
                      end={dashboardStats.totals.users}
                      className="text-2xl font-bold text-black"
                    />
                  </div>
                </div>
                <div className="rounded-full bg-gray-100 p-2">
                  <Users className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Projects */}
          <Card className="border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Total Projects
                  </p>
                  <div className="mt-1 flex items-center">
                    <CountUp
                      end={dashboardStats.totals.projects}
                      className="text-2xl font-bold text-black"
                    />
                  </div>
                </div>
                <div className="rounded-full bg-gray-100 p-2">
                  <FolderOpen className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Signups */}
          <Card className="border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Today's Signups
                  </p>
                  <div className="mt-1 flex items-center">
                    <CountUp
                      end={dashboardStats.today.users}
                      className="text-2xl font-bold text-black"
                    />
                    <TrendingUp className="ml-1 h-4 w-4 text-green-600" />
                  </div>
                </div>
                <div className="rounded-full bg-gray-100 p-2">
                  <Users className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Projects */}
          <Card className="border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Today's Projects
                  </p>
                  <div className="mt-1 flex items-center">
                    <CountUp
                      end={dashboardStats.today.projects}
                      className="text-2xl font-bold text-black"
                    />
                    <TrendingUp className="ml-1 h-4 w-4 text-green-600" />
                  </div>
                </div>
                <div className="rounded-full bg-gray-100 p-2">
                  <FolderOpen className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Daily Breakdown */}
        <Card className="mb-8 border border-gray-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-black">
              <BarChart3 className="h-5 w-5 text-gray-600" />
              Daily Breakdown
              <span className="text-xs font-normal text-gray-500">
                (UTC days, saved nightly)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4 font-medium">Day</th>
                    <th className="py-2 pr-4 font-medium">Active Users</th>
                    <th className="py-2 pr-4 font-medium">Signups</th>
                    <th className="py-2 pr-4 font-medium">New Projects</th>
                    <th className="py-2 pr-4 font-medium">Total Users</th>
                    <th className="py-2 font-medium">Total Projects</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Today (in progress, live from aggregates) */}
                  {engagementStats && (
                    <tr className="border-b border-gray-100 bg-green-50/40">
                      <td className="py-2 pr-4 font-medium text-black">
                        {engagementStats.today.day}
                        <Badge className="ml-2 border-green-200 bg-green-100 text-[10px] text-green-700">
                          TODAY
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-black">
                        {engagementStats.today.activeUsers}
                      </td>
                      <td className="py-2 pr-4 text-black">
                        {engagementStats.today.newUsers}
                      </td>
                      <td className="py-2 pr-4 text-black">
                        {engagementStats.today.newProjects}
                      </td>
                      <td className="py-2 pr-4 text-black">
                        {engagementStats.totals.users}
                      </td>
                      <td className="py-2 text-black">
                        {engagementStats.totals.projects}
                      </td>
                    </tr>
                  )}
                  {/* Saved history (excludes today; snapshot runs after UTC midnight) */}
                  {engagementStats?.history
                    .filter((row) => row.day !== engagementStats.today.day)
                    .map((row) => (
                      <tr key={row.day} className="border-b border-gray-100">
                        <td className="py-2 pr-4 font-medium text-black">
                          {row.day}
                        </td>
                        <td className="py-2 pr-4 text-black">
                          {row.activeUsers}
                        </td>
                        <td className="py-2 pr-4 text-black">{row.newUsers}</td>
                        <td className="py-2 pr-4 text-black">
                          {row.newProjects}
                        </td>
                        <td className="py-2 pr-4 text-gray-600">
                          {row.totalUsers}
                        </td>
                        <td className="py-2 text-gray-600">
                          {row.totalProjects}
                        </td>
                      </tr>
                    ))}
                  {engagementStats && engagementStats.history.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-500">
                        No saved daily snapshots yet — history is saved nightly
                        at 00:05 UTC.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Live Activity Stream */}
        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-black">
              <Activity className="h-5 w-5 text-gray-600" />
              Activity Stream
              <Badge className="ml-2 border-green-200 bg-green-100 text-green-700">
                LIVE
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {liveActivity?.map((activity, index) => (
                <div
                  key={`${activity.type}-${activity.timestamp}-${index}`}
                  className={`flex items-center gap-3 rounded border p-3 transition-shadow hover:shadow-sm ${getActivityColor(activity.type)}`}
                >
                  <div className="flex-shrink-0">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">
                        {getActivityLabel(activity.type)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTime(activity.timestamp)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      {getActivityDescription(activity)}
                    </div>
                  </div>
                </div>
              )) || (
                <div className="py-8 text-center text-gray-500">
                  <Activity className="mx-auto mb-4 h-8 w-8 opacity-50" />
                  <p className="text-sm">Waiting for activity...</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        {/* Confetti overlay */}
        <Confetti active={showConfetti} onComplete={resetConfetti} />
      </div>
    )
  }

  return (
    <div key={user?.role ?? 'unknown'} className="min-h-screen bg-white">
      <AdminNavbar
        activeTab={activeView === 'admin' ? undefined : activeView}
        onTabChange={handleTabChange}
      />
      {renderContent()}
      <TicketDetailDialog
        ticketId={selectedTicketId}
        open={selectedTicketId !== null}
        onOpenChange={(open) => !open && setSelectedTicketId(null)}
      />
      <IntegrationApprovalDialog
        integration={selectedIntegration}
        open={selectedIntegration !== null}
        onOpenChange={(open) => !open && setSelectedIntegration(null)}
        onUpdate={() => {
          setSelectedIntegration(null)
        }}
      />
    </div>
  )
}
