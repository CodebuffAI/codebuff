'use client'

import {
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronRight,
  Network,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/vly/components/ui/badge'
import { Button } from '@/vly/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/vly/components/ui/card'
import { Checkbox } from '@/vly/components/ui/checkbox'
import { Skeleton } from '@/vly/components/ui/skeleton'
import { Toaster } from '@/vly/components/ui/sonner'

// --- Mirrors of the server payload (kept local so the client bundle doesn't
//     pull in the server-only detection module). ---

type SuspectTier = 'high' | 'medium'
type BotSuspect = {
  userId: string
  email: string
  name: string | null
  status: string
  model: string
  ageDays: number
  msgs24h: number
  distinctHours24h: number
  maxQuietGapHours24h: number | null
  distinctAgents24h: number
  msgsLifetime: number
  githubId: string | null
  githubAgeDays: number | null
  flags: string[]
  counterSignals: string[]
  tier: SuspectTier
  score: number
}
type CreationCluster = {
  windowStart: string
  windowEnd: string
  emails: string[]
}
type SweepReport = {
  generatedAt: string
  totalSessions: number
  activeCount: number
  queuedCount: number
  suspects: BotSuspect[]
  creationClusters: CreationCluster[]
}

type ApiAbuseSampleRun = {
  runId: string
  messages: number
  clientIds: number
  steps: number
  status: string | null
  totalSteps: number | null
  durationMinutes: number | null
  firstMessageAt: string
  lastMessageAt: string
}
type ApiAbuseSuspect = {
  userId: string
  email: string | null
  name: string | null
  banned: boolean
  userAgeDays: number | null
  score: number
  flags: string[]
  messageCount: number
  runCount: number
  clientIdCount: number
  missingStepMessages: number
  missingStepRatio: number
  maxMessagesPerRun: number
  maxClientIdsPerRun: number
  avgClientIdsPerRun: number
  maxRunDurationMinutes: number | null
  runningRunCount: number
  completedRunCount: number
  modelCount: number
  agentCount: number
  firstMessageAt: string
  lastMessageAt: string
  models: string[]
  agents: string[]
  sampleRuns: ApiAbuseSampleRun[]
}
type ApiAbuseReport = {
  generatedAt: string
  lookbackHours: number
  minScore: number
  totalScanned: number
  suspects: ApiAbuseSuspect[]
}
type CombinedReport = {
  apiAbuse: ApiAbuseReport | null
  session: SweepReport | null
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'forbidden'; status: number }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; report: CombinedReport }

const LOOKBACKS = [
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
]

export default function AbuseDashboardPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [banning, setBanning] = useState(false)
  const [hours, setHours] = useState(168)
  const [minScore, setMinScore] = useState(30)

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    setSelected(new Set())
    try {
      const res = await fetch(
        `/api/admin/abuse?hours=${hours}&minScore=${minScore}`,
        { cache: 'no-store' },
      )
      if (res.status === 401 || res.status === 403) {
        setState({ kind: 'forbidden', status: res.status })
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setState({
          kind: 'error',
          message: body?.error ?? `Request failed (${res.status})`,
        })
        return
      }
      const report = (await res.json()) as CombinedReport
      setState({ kind: 'ready', report })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      })
    }
  }, [hours, minScore])

  useEffect(() => {
    void load()
  }, [load])

  const apiSuspects =
    state.kind === 'ready' ? (state.report.apiAbuse?.suspects ?? []) : []
  const sessionSuspects =
    state.kind === 'ready' ? (state.report.session?.suspects ?? []) : []

  // Email lookup across both reports — for the ban confirm preview.
  const emailByUser = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of apiSuspects) m.set(s.userId, s.email ?? s.userId)
    for (const s of sessionSuspects) if (!m.has(s.userId)) m.set(s.userId, s.email)
    return m
  }, [apiSuspects, sessionSuspects])

  const toggle = (userId: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })

  const selectMany = (userIds: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of userIds) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const banSelected = async () => {
    const userIds = [...selected]
    if (userIds.length === 0) return
    const emails = userIds.map((id) => emailByUser.get(id) ?? id)
    const preview = emails.slice(0, 10).join('\n')
    const ok = window.confirm(
      `Ban ${userIds.length} user(s)? Sets banned=true and clears their free ` +
        `sessions.\n\n${preview}${
          userIds.length > 10 ? `\n…and ${userIds.length - 10} more` : ''
        }`,
    )
    if (!ok) return

    setBanning(true)
    try {
      const res = await fetch('/api/admin/abuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? `Ban failed (${res.status})`)
        return
      }
      toast.success(
        `Banned ${body.bannedEmails?.length ?? userIds.length} user(s); ` +
          `cleared ${body.freeSessionsCleared ?? 0} free session(s).`,
      )
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ban request failed')
    } finally {
      setBanning(false)
    }
  }

  if (state.kind === 'forbidden') {
    return (
      <CenteredMessage
        icon={<AlertTriangle className="mx-auto mb-4 h-16 w-16 text-red-500" />}
        title="Access Restricted"
        subtitle={
          state.status === 401
            ? 'Please sign in with an admin account.'
            : 'Admin access required (@codebuff.com or allow-listed email).'
        }
      />
    )
  }

  const report = state.kind === 'ready' ? state.report : null

  return (
    <div className="min-h-screen bg-background">
      {/* Root layout has no Toaster (only the /web group does), so mount one. */}
      <Toaster position="top-right" richColors />
      <div className="mx-auto max-w-[1400px] p-6">
        {/* Header + controls */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <ShieldCheck className="h-6 w-6 text-foreground" />
              Freebuff Abuse Review
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Request-level proxy/farm fingerprints (the strong signal for free
              API reselling) plus active-session behavioral heuristics. Select
              rows and ban — sets <code>banned=true</code> and clears free
              sessions.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Lookback
              </label>
              <div className="flex overflow-hidden rounded-md border border-border">
                {LOOKBACKS.map((l) => (
                  <button
                    key={l.hours}
                    onClick={() => setHours(l.hours)}
                    className={`px-3 py-1.5 text-sm ${
                      hours === l.hours
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Min score
              </label>
              <input
                type="number"
                value={minScore}
                min={0}
                onChange={(e) => setMinScore(Number(e.target.value) || 0)}
                className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={state.kind === 'loading'}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${
                  state.kind === 'loading' ? 'animate-spin' : ''
                }`}
              />
              Refresh
            </Button>
          </div>
        </div>

        {state.kind === 'loading' && <LoadingSkeleton />}

        {state.kind === 'error' && (
          <Card className="border-red-500/30 bg-red-500/10">
            <CardContent className="p-4 text-sm text-red-400">
              Failed to load report: {state.message}
            </CardContent>
          </Card>
        )}

        {report && (
          <>
            <SummaryRow report={report} />

            {/* Sticky action bar */}
            <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 py-3 backdrop-blur">
              <span className="text-sm font-medium text-foreground">
                {selected.size} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
                disabled={selected.size === 0}
              >
                Clear
              </Button>
              <div className="ml-auto">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void banSelected()}
                  disabled={selected.size === 0 || banning}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  {banning ? 'Banning…' : `Ban selected (${selected.size})`}
                </Button>
              </div>
            </div>

            <ApiAbuseSection
              report={report.apiAbuse}
              selected={selected}
              onToggle={toggle}
              onSelectMany={selectMany}
            />

            <SessionSection
              report={report.session}
              selected={selected}
              onToggle={toggle}
              onSelectMany={selectMany}
            />

            <p className="mt-6 text-xs text-muted-foreground">
              Signals are heuristics — review flags, counter-signals &amp; sample
              runs before banning. Established accounts with real agent steps are
              dampened, not cleared.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ report }: { report: CombinedReport }) {
  const api = report.apiAbuse
  const session = report.session
  const apiCount = api?.suspects.length ?? 0
  const strongFanout =
    api?.suspects.filter((s) => s.maxClientIdsPerRun >= 10).length ?? 0
  const stats = [
    { label: 'API suspects', value: api ? apiCount : '—', danger: apiCount > 0 },
    { label: 'Proxy fanout ≥10', value: strongFanout, danger: strongFanout > 0 },
    { label: 'Scanned (window)', value: api?.totalScanned ?? '—' },
    { label: 'Live sessions', value: session?.totalSessions ?? '—' },
    { label: 'Active / queued', value: session ? `${session.activeCount} / ${session.queuedCount}` : '—' },
    { label: 'Session suspects', value: session?.suspects.length ?? '—' },
  ]
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((s) => (
        <Card key={s.label} className="border-border">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {s.label}
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${
                s.danger ? 'text-red-400' : 'text-foreground'
              }`}
            >
              {s.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// --- API / proxy abuse (primary) ---

function ApiAbuseSection({
  report,
  selected,
  onToggle,
  onSelectMany,
}: {
  report: ApiAbuseReport | null
  selected: Set<string>
  onToggle: (id: string) => void
  onSelectMany: (ids: string[], on: boolean) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (!report) {
    return (
      <SectionShell
        title="API / proxy abuse"
        subtitle="Request-level scan failed — see server logs."
      >
        <div className="py-6 text-center text-sm text-red-400">
          Could not load the request-level scan.
        </div>
      </SectionShell>
    )
  }

  const suspects = report.suspects
  const ids = suspects.map((s) => s.userId)
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id))

  return (
    <SectionShell
      title="API / proxy abuse"
      icon={<Network className="h-4 w-4 text-muted-foreground" />}
      subtitle={`Held-open proxy runs & sock farms over the last ${formatHours(
        report.lookbackHours,
      )} · score ≥ ${report.minScore} · ${report.totalScanned} accounts scanned`}
      action={
        suspects.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectMany(ids, !allSelected)}
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </Button>
        ) : null
      }
    >
      {suspects.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          No request-level proxy/farm suspects in this window. 🎉
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Score</th>
                <th className="px-3 py-2 text-right font-medium">Msgs</th>
                <th className="px-3 py-2 text-right font-medium">Runs</th>
                <th className="px-3 py-2 text-right font-medium">Clients</th>
                <th
                  className="px-3 py-2 text-right font-medium"
                  title="Max distinct client_ids in a single run — proxy fanout"
                >
                  Max c/run
                </th>
                <th
                  className="px-3 py-2 text-right font-medium"
                  title="Share of messages with no agent_step — proxy/farm tell"
                >
                  No-step%
                </th>
                <th
                  className="px-3 py-2 text-right font-medium"
                  title="Longest single run (held-open socket)"
                >
                  Max dur
                </th>
                <th className="px-3 py-2 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {suspects.map((s) => {
                const isSel = selected.has(s.userId)
                const isOpen = expanded.has(s.userId)
                return (
                  <Fragment key={s.userId}>
                    <tr
                      className={`border-b border-border align-top ${
                        isSel ? 'bg-red-500/10' : 'hover:bg-muted/50'
                      }`}
                    >
                      <td className="px-2 py-2">
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => onToggle(s.userId)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => toggleExpand(s.userId)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="expand"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">
                          {s.email ?? (
                            <span className="italic text-muted-foreground">
                              {s.userId.slice(0, 8)}…
                            </span>
                          )}
                          {s.banned && (
                            <Badge className="ml-2 border-border bg-muted text-muted-foreground">
                              banned
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.name || <span className="italic">no name</span>}
                          {s.userAgeDays !== null &&
                            ` · acct ${s.userAgeDays.toFixed(1)}d`}
                          {s.runningRunCount > 0 &&
                            ` · ${s.runningRunCount} running`}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ScoreBadge score={s.score} />
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {s.messageCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {s.runCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {s.clientIdCount.toLocaleString()}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${
                          s.maxClientIdsPerRun >= 10
                            ? 'text-red-400'
                            : s.maxClientIdsPerRun >= 3
                              ? 'text-amber-400'
                              : 'text-foreground'
                        }`}
                      >
                        {s.maxClientIdsPerRun}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${
                          s.missingStepRatio >= 0.9
                            ? 'text-red-400'
                            : s.missingStepRatio >= 0.5
                              ? 'text-amber-400'
                              : 'text-foreground'
                        }`}
                      >
                        {Math.round(s.missingStepRatio * 100)}%
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {s.maxRunDurationMinutes === null
                          ? '—'
                          : formatDuration(s.maxRunDurationMinutes)}
                      </td>
                      <td className="px-3 py-2">
                        <FlagChips flags={s.flags} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-muted/30">
                        <td />
                        <td />
                        <td colSpan={9} className="px-3 py-3">
                          <ApiAbuseDetail suspect={s} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  )
}

function ApiAbuseDetail({ suspect }: { suspect: ApiAbuseSuspect }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KV label="Avg clients/run" value={suspect.avgClientIdsPerRun.toFixed(1)} />
        <KV label="Max msgs/run" value={String(suspect.maxMessagesPerRun)} />
        <KV
          label="Runs (run/done)"
          value={`${suspect.runningRunCount} / ${suspect.completedRunCount}`}
        />
        <KV
          label="Active window"
          value={`${shortTime(suspect.firstMessageAt)} → ${shortTime(
            suspect.lastMessageAt,
          )}`}
        />
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        <div>
          <span className="font-medium text-muted-foreground">
            Models ({suspect.modelCount}):
          </span>{' '}
          <span className="text-foreground">
            {suspect.models.slice(0, 10).join(', ')}
            {suspect.models.length > 10 ? ', …' : ''}
          </span>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">
            Agents ({suspect.agentCount}):
          </span>{' '}
          <span className="text-foreground">{suspect.agents.join(', ')}</span>
        </div>
      </div>

      {suspect.sampleRuns.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Top runs by client fanout
          </p>
          <div className="overflow-x-auto rounded border border-border bg-card">
            <table className="w-full text-xs">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">Run</th>
                  <th className="px-2 py-1 text-right font-medium">Msgs</th>
                  <th className="px-2 py-1 text-right font-medium">Clients</th>
                  <th className="px-2 py-1 text-right font-medium">Steps</th>
                  <th className="px-2 py-1 font-medium">Status</th>
                  <th className="px-2 py-1 text-right font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {suspect.sampleRuns.map((r) => (
                  <tr key={r.runId} className="border-b border-border">
                    <td className="px-2 py-1 font-mono text-muted-foreground">
                      {r.runId.slice(0, 8)}…
                    </td>
                    <td className="px-2 py-1 text-right text-foreground">
                      {r.messages}
                    </td>
                    <td
                      className={`px-2 py-1 text-right ${
                        r.clientIds >= 10
                          ? 'font-semibold text-red-400'
                          : 'text-foreground'
                      }`}
                    >
                      {r.clientIds}
                    </td>
                    <td className="px-2 py-1 text-right text-foreground">
                      {r.steps}
                      {r.totalSteps !== null ? `/${r.totalSteps}` : ''}
                    </td>
                    <td className="px-2 py-1 text-foreground">
                      {r.status ?? '—'}
                    </td>
                    <td className="px-2 py-1 text-right text-foreground">
                      {r.durationMinutes === null
                        ? '—'
                        : formatDuration(r.durationMinutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Active-session behavioral suspects (secondary) ---

function SessionSection({
  report,
  selected,
  onToggle,
  onSelectMany,
}: {
  report: SweepReport | null
  selected: Set<string>
  onToggle: (id: string) => void
  onSelectMany: (ids: string[], on: boolean) => void
}) {
  if (!report) return null
  const suspects = report.suspects
  const ids = suspects.map((s) => s.userId)
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id))

  return (
    <SectionShell
      className="mt-8"
      title="Active-session behavioral suspects"
      subtitle="Heuristics over currently-admitted free sessions (24/7 usage, volume, region, GitHub age). Coarser than the request-level scan above."
      action={
        suspects.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectMany(ids, !allSelected)}
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </Button>
        ) : null
      }
    >
      {suspects.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          No active-session suspects right now.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 text-right font-medium">Score</th>
                <th className="px-3 py-2 text-right font-medium">Age</th>
                <th className="px-3 py-2 text-right font-medium">GH age</th>
                <th className="px-3 py-2 text-right font-medium">Msgs 24h</th>
                <th className="px-3 py-2 text-right font-medium">Agents</th>
                <th className="px-3 py-2 font-medium">Signals</th>
              </tr>
            </thead>
            <tbody>
              {suspects.map((s) => {
                const isSel = selected.has(s.userId)
                return (
                  <tr
                    key={s.userId}
                    className={`border-b border-border align-top ${
                      isSel ? 'bg-red-500/10' : 'hover:bg-muted/50'
                    }`}
                  >
                    <td className="px-2 py-2">
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => onToggle(s.userId)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{s.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.name || <span className="italic">no name</span>} ·{' '}
                        {s.status} · {s.model}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        className={
                          s.tier === 'high'
                            ? 'border-red-500/30 bg-red-500/15 text-red-400'
                            : 'border-amber-500/30 bg-amber-500/15 text-amber-400'
                        }
                      >
                        {s.tier}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">
                      {s.score}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {s.ageDays.toFixed(1)}d
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {s.githubAgeDays !== null
                        ? `${s.githubAgeDays.toFixed(0)}d`
                        : s.githubId === null
                          ? 'n/a'
                          : '?'}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {s.msgs24h}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">
                      {s.distinctAgents24h}
                    </td>
                    <td className="px-3 py-2">
                      <FlagChips flags={s.flags} counter={s.counterSignals} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreationClusters clusters={report.creationClusters} />
    </SectionShell>
  )
}

// --- Shared bits ---

function SectionShell({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={`overflow-hidden border-border ${className ?? ''}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b border-border bg-card pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-foreground">
            {icon}
            {title}
          </CardTitle>
          {subtitle && (
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 60
      ? 'bg-red-500/15 text-red-400 border-red-500/30'
      : score >= 40
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        : 'bg-muted text-muted-foreground border-border'
  return (
    <Badge className={`${cls} font-mono`}>{score}</Badge>
  )
}

function FlagChips({
  flags,
  counter,
}: {
  flags: string[]
  counter?: string[]
}) {
  return (
    <div className="flex max-w-md flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f}
          className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-400"
        >
          {f}
        </span>
      ))}
      {counter?.map((c) => (
        <span
          key={c}
          className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-400"
        >
          {c}
        </span>
      ))}
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

function CreationClusters({ clusters }: { clusters: CreationCluster[] }) {
  if (clusters.length === 0) return null
  return (
    <div className="border-t border-border p-4">
      <p className="mb-2 text-sm font-medium text-foreground">
        Signup clusters ({clusters.length})
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        Accounts created within 30 min of each other — possible mass signup.
      </p>
      <div className="space-y-3">
        {clusters.map((c, i) => (
          <div key={i} className="rounded border border-border p-3">
            <div className="mb-1 text-xs text-muted-foreground">
              {new Date(c.windowStart).toLocaleString()} —{' '}
              {new Date(c.windowEnd).toLocaleString()} · n={c.emails.length}
            </div>
            <div className="flex flex-wrap gap-1">
              {c.emails.map((e) => (
                <span
                  key={e}
                  className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {e}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

function CenteredMessage({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center text-foreground">
        {icon}
        <h1 className="mb-2 text-3xl font-bold">{title}</h1>
        <p className="text-lg text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}

function formatHours(h: number): string {
  if (h % 24 === 0) return `${h / 24}d`
  return `${h}h`
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  const hrs = minutes / 60
  if (hrs < 48) return `${hrs.toFixed(1)}h`
  return `${(hrs / 24).toFixed(1)}d`
}

function shortTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}
