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
  KeyRound,
  Link2,
  Loader,
  RefreshCw,
  Users,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'

const AGENT_WINDOW_DAYS = [
  { label: '24 hours', value: 1 },
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
] as const

const formatAgentType = (type: string) => type

const CLOUD_FEATURE_LABELS: Record<string, string> = {
  publish: 'Publish',
  invite: 'Share with members',
  integration: 'Integrations',
  custom_link: 'Custom links',
  chatgpt_oauth: 'ChatGPT OAuth',
  openai_byok: 'OpenAI BYOK',
  anthropic_byok: 'Anthropic BYOK',
  bedrock_byok: 'Bedrock BYOK',
}

const CLOUD_FEATURE_ORDER = [
  'publish',
  'invite',
  'integration',
  'custom_link',
  'chatgpt_oauth',
  'openai_byok',
  'anthropic_byok',
  'bedrock_byok',
]

const formatCredits = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)

export default function ResourceUsageAdminPage() {
  const user = useSignedInUser()
  const isAdmin = user?.role === 'god' || user?.role === 'admin'
  const [refreshing, setRefreshing] = useState(false)
  const [agentWindowDays, setAgentWindowDays] = useState<number>(7)
  const [selectedFreebuffUserId, setSelectedFreebuffUserId] =
    useState<Id<'users'> | null>(null)

  const agentStatsTimeRange = useMemo(() => {
    const endTime = new Date().toISOString()
    const startTime = new Date(
      Date.now() - agentWindowDays * 24 * 60 * 60 * 1000,
    ).toISOString()
    return { startTime, endTime }
  }, [agentWindowDays])

  const data = useQuery(
    api.admin_usage.getAdminUsageData,
    isAdmin ? {} : 'skip',
  )
  const agentStats = useQuery(
    api.admin_agent_stats.getAgentAuthAndSessionStats,
    isAdmin ? agentStatsTimeRange : 'skip',
  )
  const cloudFeatureUsage = useQuery(
    api.cloud_feature_usage.getCloudFeatureUsage,
    isAdmin ? agentStatsTimeRange : 'skip',
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
              Auth connections, agent session mix, top users, and model
              breakdown.
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
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Auth &amp; agent sessions
                </h2>
                <p className="text-sm text-muted-foreground">
                  ChatGPT subscription / BYOK connections (refreshed nightly)
                  and prompt volume by agent (incremental, per send).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {AGENT_WINDOW_DAYS.map(({ label, value }) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={agentWindowDays === value ? 'default' : 'outline'}
                    onClick={() => setAgentWindowDays(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {!agentStats ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    {
                      label: 'ChatGPT subscription',
                      value: agentStats.auth.chatgptSubscriptionConnected,
                      sub: 'Codex OAuth connected (not revoked)',
                      icon: Link2,
                    },
                    {
                      label: 'OpenAI BYOK',
                      value: agentStats.auth.codexOpenAiByok,
                      sub: 'Users with saved OpenAI API key',
                      icon: KeyRound,
                    },
                    {
                      label: 'Anthropic BYOK',
                      value: agentStats.auth.claudeAnthropicByok,
                      sub: 'Users with saved Anthropic key',
                      icon: KeyRound,
                    },
                    {
                      label: 'Bedrock BYOK',
                      value: agentStats.auth.claudeBedrockByok,
                      sub: 'Users with saved Bedrock token',
                      icon: KeyRound,
                    },
                    {
                      label: 'GPT pref: OAuth',
                      value: agentStats.auth.gptPreferredOAuth,
                      sub: 'gpt_auth_method = oauth',
                      icon: Users,
                    },
                    {
                      label: 'GPT pref: BYOK',
                      value: agentStats.auth.gptPreferredByok,
                      sub: 'gpt_auth_method = byok',
                      icon: Users,
                    },
                  ].map(({ label, value, sub, icon: Icon }) => (
                    <div
                      key={label}
                      className="border-y border-border px-1 py-3 sm:border sm:rounded-lg sm:px-4"
                    >
                      <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                        <Icon className="h-4 w-4" />
                        {label}
                      </div>
                      <p className="mt-2 text-2xl font-semibold tabular-nums">
                        {value.toLocaleString()}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                          / {agentStats.auth.totalUsers.toLocaleString()}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {sub}
                      </p>
                    </div>
                  ))}
                </div>

                {!agentStats.auth.authTrackedIncrementally ||
                !agentStats.threadsTrackedIncrementally ? (
                  <p className="mb-4 text-xs text-muted-foreground">
                    Auth connections and thread counts are incremental from
                    deploy forward (bumped when a user connects a credential or
                    creates a thread). Existing connections before this shipped
                    are not backfilled.
                  </p>
                ) : null}

                {!agentStats.sessionsInRange.promptsTrackedIncrementally ? (
                  <p className="mb-4 text-xs text-muted-foreground">
                    Prompt counts are incremental from deploy forward (each user
                    send bumps a daily counter). Days before this shipped will
                    show zero — not a full historical backfill.
                  </p>
                ) : null}

                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle>Prompts by agent</CardTitle>
                    <CardDescription>
                      User sends in the selected window, from incremental daily
                      counters (not a message-table scan).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Agent</TableHead>
                          <TableHead className="text-right">
                            Prompts
                          </TableHead>
                          <TableHead className="text-right">
                            Threads created (incremental)
                          </TableHead>
                          <TableHead className="text-right">
                            Model invocations (all time)
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          'Freebuff',
                          'Codex',
                          'Claude Code',
                          'Gemini CLI',
                        ].map((agentType) => (
                          <TableRow key={agentType}>
                            <TableCell className="font-medium">
                              {formatAgentType(agentType)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {(
                                agentStats.sessionsInRange
                                  .userMessagesByAgentType[agentType] ?? 0
                              ).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {(
                                agentStats.threadsByAgentType[agentType] ?? 0
                              ).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {(
                                agentStats.modelInvocationsByAgentType[
                                  agentType
                                ] ?? 0
                              ).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/30 font-medium">
                          <TableCell>Freebuff completed runs</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {agentStats.sessionsInRange.freebuffRunsCompleted.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatCredits(
                              agentStats.sessionsInRange.freebuffMeteredCredits,
                            )}{' '}
                            credits
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Cloud feature usage</h2>
              <p className="text-sm text-muted-foreground">
                Who uses each Freebuff Cloud feature in the selected window.
                Counts are incremental from deploy forward (each use bumps a
                per-day counter); the recent table shows individual actors.
              </p>
            </div>

            {!cloudFeatureUsage ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {CLOUD_FEATURE_ORDER.map((feature) => {
                    const stat = cloudFeatureUsage.totalsByFeature[feature] ?? {
                      count: 0,
                      uniqueUsers: 0,
                    }
                    return (
                      <div
                        key={feature}
                        className="border-y border-border px-1 py-3 sm:rounded-lg sm:border sm:px-4"
                      >
                        <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                          <Zap className="h-4 w-4" />
                          {CLOUD_FEATURE_LABELS[feature] ?? feature}
                        </div>
                        <p className="mt-2 text-2xl font-semibold tabular-nums">
                          {stat.count.toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {stat.uniqueUsers.toLocaleString()} user-day
                          {stat.uniqueUsers === 1 ? '' : 's'}
                        </p>
                      </div>
                    )
                  })}
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent feature uses</CardTitle>
                    <CardDescription>
                      Most recent {cloudFeatureUsage.recent.length} events (newest
                      first).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {cloudFeatureUsage.recent.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No feature usage recorded in this window yet.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Feature</TableHead>
                            <TableHead>Detail</TableHead>
                            <TableHead className="text-right">When</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cloudFeatureUsage.recent.map((event) => (
                            <TableRow key={event.id}>
                              <TableCell>
                                <p className="font-medium">{event.userName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {event.userEmail}
                                </p>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {CLOUD_FEATURE_LABELS[event.feature] ??
                                    event.feature}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {event.detail ?? '—'}
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {new Date(event.createdAt).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </section>

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
