'use client'

import { api } from '@/convex/_generated/api'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
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
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Bug,
  CheckCircle2,
  Clock,
  ExternalLink,
  ImageIcon,
  Lightbulb,
  Loader2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

function statusBadgeClass(status: string) {
  switch (status) {
    case 'completed':
      return 'border-green-200 bg-green-100 text-green-700'
    case 'running':
      return 'border-blue-200 bg-blue-100 text-blue-700'
    case 'queued':
      return 'border-amber-200 bg-amber-100 text-amber-700'
    case 'triaging':
      return 'border-purple-200 bg-purple-100 text-purple-700'
    case 'failed':
      return 'border-red-200 bg-red-100 text-red-700'
    case 'rejected':
      return 'border-gray-200 bg-gray-100 text-gray-500'
    default:
      return 'border-gray-200 bg-gray-100 text-gray-700'
  }
}

type FailureKind =
  | 'timed_out'
  | 'agent_error'
  | 'cancelled'
  | 'dispatch_error'
  | null

// The one-line outcome for a pipeline row: did the report get sent to the
// cloud project, get held back, or hit an error — and specifically which
// kind (timed out at the 20-min cloud turn budget vs. an actual agent error
// vs. never dispatched at all), not just a generic failure label.
function outcomeFor(item: {
  status: string
  error: string | null
  failureKind: FailureKind
}): {
  label: string
  className: string
} {
  // A triage-step error (model threw / bad output) lands on status
  // 'rejected' with `error` set — distinct from a genuine "model decided
  // not to send this" rejection, which has no error.
  if (item.status === 'rejected' && item.error) {
    return {
      label: 'TRIAGE ERROR',
      className: 'border-red-300 bg-red-50 text-red-700',
    }
  }

  if (item.status === 'failed') {
    switch (item.failureKind) {
      case 'timed_out':
        return {
          label: 'TIMED OUT (20 MIN)',
          className: 'border-orange-300 bg-orange-50 text-orange-700',
        }
      case 'agent_error':
        return {
          label: 'AGENT ERROR',
          className: 'border-red-300 bg-red-50 text-red-700',
        }
      case 'cancelled':
        return {
          label: 'CANCELLED',
          className: 'border-gray-300 bg-gray-50 text-gray-600',
        }
      default:
        return {
          label: 'DISPATCH FAILED',
          className: 'border-red-300 bg-red-50 text-red-700',
        }
    }
  }

  switch (item.status) {
    case 'triaging':
      return {
        label: 'TRIAGING…',
        className: 'border-purple-200 bg-purple-50 text-purple-700',
      }
    case 'rejected':
      return {
        label: 'NOT SENT',
        className: 'border-gray-200 bg-gray-50 text-gray-600',
      }
    case 'queued':
      return {
        label: 'QUEUED → WILL SEND',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
      }
    case 'running':
      return {
        label: 'SENT · RUNNING',
        className: 'border-blue-200 bg-blue-50 text-blue-700',
      }
    case 'completed':
      return {
        label: 'SENT · DONE',
        className: 'border-green-200 bg-green-50 text-green-700',
      }
    default:
      return {
        label: item.status.toUpperCase(),
        className: 'border-gray-200 bg-gray-50 text-gray-600',
      }
  }
}

function formatTs(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

export default function AdminBugFixerPage() {
  const user = useSignedInUser()
  const isAdmin = user?.role === 'god' || user?.role === 'admin'
  const isGod = user?.role === 'god'

  const config = useQuery(api.bug_fixer.config.getConfig, isAdmin ? {} : 'skip')
  const queue = useQuery(api.bug_fixer.queue.listQueue, isAdmin ? {} : 'skip')
  const limits = useQuery(
    api.bug_fixer.queue.getDailyLimits,
    isAdmin ? {} : 'skip',
  )
  const updateConfig = useMutation(api.bug_fixer.config.updateConfig)

  const [semanticId, setSemanticId] = useState('')
  const [saving, setSaving] = useState(false)

  // Seed the input from the saved config once it loads (but never clobber
  // in-progress typing after that).
  const savedSemanticId = config?.targetProjectSemanticId ?? ''
  useEffect(() => {
    setSemanticId((current) => (current === '' ? savedSemanticId : current))
  }, [savedSemanticId])

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-white p-8">
        <Skeleton className="mx-auto h-8 w-80" />
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

  const cloudProjectUrl = savedSemanticId
    ? `/cloud/project/${savedSemanticId}`
    : null

  // Pipeline funnel counts for the visibility summary. "Sent" is anything the
  // bot actually dispatched into the cloud project (queued → running → done);
  // "errors" spans both triage-step failures and dispatch failures.
  const counts = {
    total: queue?.length ?? 0,
    triaging: queue?.filter((item) => item.status === 'triaging').length ?? 0,
    rejected:
      queue?.filter((item) => item.status === 'rejected' && !item.error)
        .length ?? 0,
    sent:
      queue?.filter((item) =>
        ['queued', 'running', 'completed'].includes(item.status),
      ).length ?? 0,
    errors:
      queue?.filter(
        (item) => item.status === 'failed' || Boolean(item.error),
      ).length ?? 0,
  }

  const handleSave = async (enabled: boolean) => {
    setSaving(true)
    try {
      await updateConfig({
        targetProjectSemanticId: semanticId.trim(),
        enabled,
      })
      toast.success(enabled ? 'Bug fixer bot enabled' : 'Configuration saved')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not save config',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <a
            href="/web/admin"
            className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Admin
          </a>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-black">
            <Bot className="h-6 w-6" />
            Bug Fixer Bot
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            AI-triaged issue reports are queued and fired as Codex runs in the
            configured Freebuff Cloud project, which creates fix PRs
            autonomously.
          </p>
        </div>

        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-black">
              Cloud Environment
              {config?.enabled ? (
                <Badge className="border-green-200 bg-green-100 text-green-700">
                  Enabled
                </Badge>
              ) : (
                <Badge className="border-gray-200 bg-gray-100 text-gray-700">
                  Disabled
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Target cloud project semantic id
              </span>
              <input
                type="text"
                value={semanticId}
                onChange={(event) => setSemanticId(event.target.value)}
                placeholder="e.g. freebuff-production-a1b2c3"
                disabled={!isGod}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-black disabled:cursor-not-allowed disabled:bg-gray-50"
              />
            </label>
            <p className="text-xs text-gray-500">
              Must be a Freebuff Cloud (connected repo) project. Runs execute
              with the Codex model using the project owner&apos;s saved Codex
              OAuth credentials, so the owner must have Codex connected.
              Queued reports only ever fire into this project.
            </p>
            {config?.targetProject && (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-black">
                <p>
                  <span className="text-gray-500">Project:</span>{' '}
                  {config.targetProject.name}
                  {config.targetProject.repoFullName
                    ? ` · ${config.targetProject.repoFullName}`
                    : ''}
                </p>
                {!config.targetProject.isConnectedRepo && (
                  <p className="mt-1 text-red-600">
                    Warning: this is not a connected-repo Cloud project —
                    dispatch will fail.
                  </p>
                )}
                {config.targetProject.deleted && (
                  <p className="mt-1 text-red-600">
                    Warning: this project is deleted.
                  </p>
                )}
              </div>
            )}
            {config === null && (
              <p className="text-sm text-gray-500">
                Not configured yet — paste a project semantic id and save.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {isGod ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving || !semanticId.trim()}
                    onClick={() => void handleSave(true)}
                  >
                    {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    Save &amp; Enable
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving || !semanticId.trim()}
                    onClick={() => void handleSave(false)}
                  >
                    Save Disabled
                  </Button>
                </>
              ) : (
                <p className="text-xs text-gray-500">
                  God-mode access is required to change this configuration.
                </p>
              )}
              {cloudProjectUrl && (
                <a
                  href={cloudProjectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-gray-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open cloud environment
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-black">
              Triage &amp; Dispatch Log
            </CardTitle>
            <p className="text-sm text-gray-600">
              Every report that enters the pipeline, its triage verdict, and
              whether it was dispatched to the cloud project — live.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {/* Pipeline funnel: at-a-glance visibility into throughput. */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: 'Total', value: counts.total, tone: 'text-black' },
                {
                  label: 'Triaging',
                  value: counts.triaging,
                  tone: 'text-purple-700',
                },
                {
                  label: 'Not sent',
                  value: counts.rejected,
                  tone: 'text-gray-600',
                },
                { label: 'Sent', value: counts.sent, tone: 'text-green-700' },
                {
                  label: 'Errors',
                  value: counts.errors,
                  tone: 'text-red-600',
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-center"
                >
                  <p className={`text-xl font-bold ${stat.tone}`}>
                    {stat.value}
                  </p>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Anti-flood daily budgets (rolling 24h, all accounts). Turns
                amber as a limit is approached and red once it's hit. */}
            {limits && (
              <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    label: 'Intake today',
                    used: limits.intakeUsed,
                    max: limits.intakeMax,
                    hint: 'reports admitted into the pipeline',
                  },
                  {
                    label: 'Codex dispatches today',
                    used: limits.dispatchUsed,
                    max: limits.dispatchMax,
                    hint: 'runs sent to the cloud project',
                  },
                ].map((budget) => {
                  const atLimit = budget.used >= budget.max
                  const near = !atLimit && budget.used >= budget.max * 0.8
                  const tone = atLimit
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : near
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-gray-200 bg-gray-50 text-gray-700'
                  return (
                    <div
                      key={budget.label}
                      className={`rounded-lg border p-2.5 ${tone}`}
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-medium uppercase tracking-wide">
                          {budget.label}
                        </span>
                        <span className="text-sm font-bold tabular-nums">
                          {budget.used} / {budget.max}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] opacity-80">
                        {atLimit
                          ? `Daily limit reached — further ${budget.hint} are held until the 24h window clears.`
                          : budget.hint}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {queue === undefined ? (
              <Skeleton className="h-24 w-full" />
            ) : queue.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                No reports have entered the pipeline yet. New issue reports are
                triaged automatically while the bot is enabled.
              </p>
            ) : (
              <div className="max-h-[40rem] space-y-3 overflow-y-auto">
                {queue.map((item) => {
                  const outcome = outcomeFor(item)
                  return (
                    <div
                      key={item._id}
                      className="rounded-lg border border-gray-200 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={`border ${outcome.className}`}>
                          {outcome.label}
                        </Badge>
                        <Badge className={statusBadgeClass(item.status)}>
                          {item.status.toUpperCase()}
                        </Badge>
                        <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                          {item.reportType === 'feature_request' ? (
                            <Lightbulb className="h-3.5 w-3.5" />
                          ) : (
                            <Bug className="h-3.5 w-3.5" />
                          )}
                          {item.reportType === 'feature_request'
                            ? 'Feature'
                            : 'Bug'}
                          {item.severity !== null
                            ? ` · ${item.severity}/10`
                            : ''}
                          {item.category ? ` · ${item.category}` : ''}
                        </span>
                        {item.screenshotCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <ImageIcon className="h-3.5 w-3.5" />
                            {item.screenshotCount}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {item.reporterName}
                          {item.reporterEmail ? ` · ${item.reporterEmail}` : ''}
                        </span>
                      </div>

                      <p className="mt-2 whitespace-pre-wrap text-sm text-black">
                        {item.issue}
                      </p>

                      {item.triageSummary && (
                        <p className="mt-2 text-xs text-gray-500">
                          <span className="font-semibold text-gray-600">
                            Summary:
                          </span>{' '}
                          {item.triageSummary}
                        </p>
                      )}

                      {item.triageReason && (
                        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-gray-50 p-2 text-xs text-gray-600">
                          {['queued', 'running', 'completed'].includes(
                            item.status,
                          ) && !item.error ? (
                            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-green-600" />
                          ) : (
                            <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-gray-400" />
                          )}
                          <span className="whitespace-pre-wrap">
                            <span className="font-semibold text-gray-700">
                              Triage verdict:
                            </span>{' '}
                            {item.triageReason}
                          </span>
                        </div>
                      )}

                      {item.error && (
                        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                          <span className="whitespace-pre-wrap break-words">
                            <span className="font-semibold">Error:</span>{' '}
                            {item.error}
                          </span>
                        </div>
                      )}

                      {/* Timeline + context row */}
                      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-[11px] text-gray-400 sm:grid-cols-2">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Entered: {formatTs(item.enqueuedAt)}
                        </span>
                        {item.startedAt && (
                          <span>Dispatched: {formatTs(item.startedAt)}</span>
                        )}
                        {item.finishedAt && (
                          <span>Finished: {formatTs(item.finishedAt)}</span>
                        )}
                        {item.reporterProjectSemanticId && (
                          <span>
                            Reporter project:{' '}
                            {item.reporterProjectSemanticId}
                          </span>
                        )}
                        <span>Target: {item.targetProjectSemanticId}</span>
                        {item.pageUrl && (
                          <span className="truncate">
                            Page: {item.pageUrl}
                          </span>
                        )}
                      </div>

                      {(item.status === 'running' ||
                        item.status === 'completed') && (
                        <a
                          href={`/cloud/project/${item.targetProjectSemanticId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {item.status === 'running'
                            ? 'Watch progress in cloud project'
                            : 'Open cloud project'}
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
