'use client'

import { useMemo, useState } from 'react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { useQuery, useMutation } from 'convex/react'
import { useSignedInUser } from '@/vly/hooks/use-user'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/vly/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/vly/components/ui/table'
import { Badge } from '@/vly/components/ui/badge'
import { Button } from '@/vly/components/ui/button'
import { Skeleton } from '@/vly/components/ui/skeleton'
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Clock3,
  Cpu,
  Gauge,
  Loader,
  RefreshCw,
  Users,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'

const formatCredits = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)

export default function ResourceUsageAdminPage() {
  const user = useSignedInUser()
  const isAdmin = user?.role === 'god' || user?.role === 'admin'
  const [refreshing, setRefreshing] = useState(false)
  const [selectedFreebuffUserId, setSelectedFreebuffUserId] =
    useState<Id<'users'> | null>(null)

  const data = useQuery(
    api.admin_usage.getAdminUsageData,
    isAdmin ? {} : 'skip',
  )
  const selectedFreebuffUsage = useQuery(
    api.admin_usage.getFreebuffUserUsage,
    isAdmin && selectedFreebuffUserId
      ? { userId: selectedFreebuffUserId, days: 30 }
      : 'skip',
  )

  const refreshModelStats = useMutation(
    (api as any).admin_usage_backfill.refreshModelStats,
  )

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshModelStats({})
      toast.success(
        'Model stats refresh started. Data will update in a few minutes.',
      )
    } catch {
      toast.error('Failed to start refresh.')
    }
    setRefreshing(false)
  }

  const models = data?.models
  const modelsByType = useMemo(() => {
    if (!models) return { cli: [], v2: [] }
    const cli = models
      .filter((m) => m.agentType !== 'v2')
      .sort((a, b) => b.total - a.total)
    const v2 = models
      .filter((m) => m.agentType === 'v2')
      .sort((a, b) => b.total - a.total)
    return { cli, v2 }
  }, [models])

  if (user === undefined) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Skeleton className="mb-6 h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin access is required to view usage estimates.
        </p>
      </div>
    )
  }

  const totalRuns = data?.users.reduce((sum, r) => sum + r.totalRuns, 0) ?? 0
  const freebuffTotals = data?.freebuffUsers.reduce(
    (totals, row) => ({
      runs: totals.runs + row.runCount,
      credits: totals.credits + row.meteredCredits,
      errors: totals.errors + row.errorCount,
      timedOut: totals.timedOut + row.timedOutCount,
      spikes: totals.spikes + (row.spikeDetected ? 1 : 0),
    }),
    { runs: 0, credits: 0, errors: 0, timedOut: 0, spikes: 0 },
  ) ?? { runs: 0, credits: 0, errors: 0, timedOut: 0, spikes: 0 }
  const selectedFreebuffUser = data?.freebuffUsers.find(
    (row) => row.userId === selectedFreebuffUserId,
  )

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-border bg-muted/40 p-2">
            <BarChart3 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Platform usage
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Top 10 users (live) and model breakdown (on-demand).
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="gap-2"
        >
          {refreshing ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh model stats
        </Button>
      </div>

      {!data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-8">
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Freebuff Web usage</h2>
                <p className="text-sm text-muted-foreground">
                  Live UTC-day usage attributed to individual Freebuff Web
                  users.
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  freebuffTotals.spikes > 0
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : undefined
                }
              >
                {freebuffTotals.spikes} flagged users
              </Badge>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: 'Runs today',
                  value: freebuffTotals.runs.toLocaleString(),
                  icon: Bot,
                },
                {
                  label: 'Metered credits',
                  value: formatCredits(freebuffTotals.credits),
                  icon: Gauge,
                },
                {
                  label: 'Errors',
                  value: freebuffTotals.errors.toLocaleString(),
                  icon: AlertTriangle,
                },
                {
                  label: 'Timed out',
                  value: freebuffTotals.timedOut.toLocaleString(),
                  icon: Clock3,
                },
              ].map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="border-y border-border px-1 py-3 sm:border"
                >
                  <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                    <Icon className="h-4 w-4" />
                    {label}
                  </div>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Today by user</CardTitle>
                    <CardDescription>
                      Select a user to inspect their last 30 days.
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {data.freebuffUsers.length} active users
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {data.freebuffUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No Freebuff Web usage recorded today.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Runs</TableHead>
                        <TableHead className="text-right">
                          Metered credits
                        </TableHead>
                        <TableHead className="text-right">Errors</TableHead>
                        <TableHead className="text-right">Timeouts</TableHead>
                        <TableHead className="text-right">Last run</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.freebuffUsers.map((row) => (
                        <TableRow
                          key={row.userId}
                          className="cursor-pointer"
                          data-state={
                            selectedFreebuffUserId === row.userId
                              ? 'selected'
                              : undefined
                          }
                          onClick={() =>
                            setSelectedFreebuffUserId(
                              selectedFreebuffUserId === row.userId
                                ? null
                                : (row.userId as Id<'users'>),
                            )
                          }
                        >
                          <TableCell>
                            <p className="font-medium">{row.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.email}
                            </p>
                          </TableCell>
                          <TableCell>
                            {row.spikeDetected ? (
                              <Badge className="border-red-300 bg-red-50 text-red-700 hover:bg-red-50">
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                Spike
                              </Badge>
                            ) : (
                              <Badge variant="outline">Normal</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.runCount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatCredits(row.meteredCredits)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.errorCount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.timedOutCount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {new Date(row.lastRunAt).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {selectedFreebuffUserId && (
              <Card className="mt-4">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>
                        {selectedFreebuffUser?.name ?? 'User'} · 30-day history
                      </CardTitle>
                      <CardDescription>
                        {selectedFreebuffUser?.email ?? selectedFreebuffUserId}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFreebuffUserId(null)}
                    >
                      Close
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!selectedFreebuffUsage ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (
                    <>
                      <div className="mb-4 grid gap-3 sm:grid-cols-4">
                        {[
                          ['Runs', selectedFreebuffUsage.totals.runs],
                          [
                            'Metered credits',
                            selectedFreebuffUsage.totals.meteredCredits,
                          ],
                          ['Errors', selectedFreebuffUsage.totals.errors],
                          ['Timeouts', selectedFreebuffUsage.totals.timedOut],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="border-l border-border pl-3"
                          >
                            <p className="text-xs text-muted-foreground">
                              {label}
                            </p>
                            <p className="text-lg font-semibold tabular-nums">
                              {formatCredits(Number(value))}
                            </p>
                          </div>
                        ))}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>UTC day</TableHead>
                            <TableHead className="text-right">Runs</TableHead>
                            <TableHead className="text-right">
                              Metered credits
                            </TableHead>
                            <TableHead className="text-right">Errors</TableHead>
                            <TableHead className="text-right">
                              Timeouts
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...selectedFreebuffUsage.days]
                            .reverse()
                            .map((day) => (
                              <TableRow key={day.day}>
                                <TableCell className="font-medium">
                                  {day.day}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {day.run_count.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatCredits(day.metered_credits)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {day.error_count.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {day.timed_out_count.toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </section>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Top 10 users</CardTitle>
                </div>
                <Badge variant="outline">
                  {totalRuns.toLocaleString()} total runs
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {data.users.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">V2</TableHead>
                      <TableHead className="text-right">CLI</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Last run</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.users.map((row, i) => (
                      <TableRow key={row.userId}>
                        <TableCell className="text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.email}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.v2Runs.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.cliRuns.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {row.totalRuns.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {new Date(row.lastRunAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {[
            { title: 'CLI Agent Models', icon: Cpu, rows: modelsByType.cli },
            { title: 'V2 Agent Models', icon: Zap, rows: modelsByType.v2 },
          ].map(({ title, icon: Icon, rows }) => (
            <Card key={title}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <CardTitle>{title}</CardTitle>
                  </div>
                  <Badge variant="outline">
                    {rows.reduce((s, r) => s + r.total, 0).toLocaleString()}{' '}
                    total
                  </Badge>
                </div>
                <CardDescription>
                  Click &quot;Refresh model stats&quot; to update.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No data yet. Click refresh to scan.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Today</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, i) => (
                        <TableRow key={row.model}>
                          <TableCell className="text-muted-foreground">
                            {i + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.model}
                            {row.recent > 0 && (
                              <Badge
                                variant="outline"
                                className="ml-2 border-green-200 bg-green-50 text-xs text-green-700"
                              >
                                active
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold tabular-nums">
                            {row.total.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.recent > 0 ? (
                              <span className="text-green-600">
                                +{row.recent.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
