'use client'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { useSignedInUser } from '@/vly/hooks/use-user'
import { cn } from '@/vly/lib/utils'
import { useAction } from 'convex/react'
import { Bug, Lightbulb, Loader2, Send, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

type IssueSource = 'chat' | 'cloud'
type ReportType = 'bug' | 'feature_request'

export function IssueReportButton({
  source,
  threadId,
  projectId,
  projectSemanticIdentifier,
  className,
}: {
  source: IssueSource
  threadId?: string | null
  projectId?: Id<'project'>
  projectSemanticIdentifier?: string
  className?: string
}) {
  const user = useSignedInUser()
  const submitIssueReport = useAction(api.issue_reports_email.submitIssueReport)

  const [open, setOpen] = useState(false)
  const [reportType, setReportType] = useState<ReportType>('bug')
  const [severity, setSeverity] = useState(3)
  const [issue, setIssue] = useState('')
  const [replyEmail, setReplyEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user?.email && !replyEmail) {
      setReplyEmail(user.email)
    }
  }, [replyEmail, user?.email])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const severityColor = useMemo(() => {
    const hue = 125 - severity * 12.5
    return `hsl(${hue} 78% 45%)`
  }, [severity])
  const scaleLabel = reportType === 'feature_request' ? 'Urgency' : 'Severity'
  const reportLabel =
    reportType === 'feature_request' ? 'Feature request' : 'Bug report'

  const canSubmit =
    issue.trim().length > 0 && replyEmail.trim().length > 0 && !submitting

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    try {
      setSubmitting(true)
      const result = await submitIssueReport({
        source,
        reportType,
        severity,
        issue: issue.trim(),
        replyEmail: replyEmail.trim(),
        pageUrl: window.location.href,
        userAgent: window.navigator.userAgent,
        threadId: threadId ?? undefined,
        projectId,
        projectSemanticIdentifier,
      })
      setIssue('')
      setReportType('bug')
      setSeverity(3)
      setOpen(false)
      toast.success(
        result.emailSent
          ? `${reportLabel} sent. We will follow up by email.`
          : `${reportLabel} saved. Email delivery will be checked by the team.`,
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not report issue',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={cn('absolute bottom-24 right-4 z-30', className)}>
      {open && (
        <div className="mb-3 w-[min(21rem,calc(100vw-2rem))] rounded-xl border border-white/15 bg-zinc-950/95 p-4 text-white shadow-2xl shadow-black/50 backdrop-blur">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">
                Report issue or new feature
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                We will reply to you as soon as possible through email.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close issue report"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setReportType('bug')}
                className={cn(
                  'flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors',
                  reportType === 'bug'
                    ? 'border-white/35 bg-white/15 text-white'
                    : 'border-white/10 bg-white/[0.04] text-white/60 hover:border-white/25 hover:text-white',
                )}
              >
                <Bug className="h-3.5 w-3.5" />
                Bug report
              </button>
              <button
                type="button"
                onClick={() => setReportType('feature_request')}
                className={cn(
                  'flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors',
                  reportType === 'feature_request'
                    ? 'border-white/35 bg-white/15 text-white'
                    : 'border-white/10 bg-white/[0.04] text-white/60 hover:border-white/25 hover:text-white',
                )}
              >
                <Lightbulb className="h-3.5 w-3.5" />
                Feature request
              </button>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-white/45">
                Reply email
              </span>
              <input
                type="email"
                value={replyEmail}
                onChange={(event) => setReplyEmail(event.target.value)}
                placeholder="you@example.com"
                className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/30"
              />
            </label>

            <label className="block space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-white/45">
                  {scaleLabel}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: severityColor }}
                >
                  {severity}/10
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={severity}
                onChange={(event) => setSeverity(Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full accent-current"
                style={{
                  color: severityColor,
                  background: `linear-gradient(90deg, #22c55e 0%, ${severityColor} ${severity * 10}%, #ef4444 100%)`,
                }}
              />
              <div className="flex justify-between text-[10px] text-white/40">
                <span>0</span>
                <span>10</span>
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-white/45">
                {reportType === 'feature_request' ? 'Feature' : 'Issue'}
              </span>
              <textarea
                value={issue}
                onChange={(event) => setIssue(event.target.value)}
                maxLength={5000}
                rows={4}
                placeholder={
                  reportType === 'feature_request'
                    ? 'What would you like us to add?'
                    : 'What happened?'
                }
                className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm leading-5 text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/30"
              />
            </label>

            <button
              type="submit"
              disabled={!canSubmit}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black transition-colors hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send report
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Report issue or new feature"
        className="flex h-10 items-center gap-2 rounded-full border border-white/15 bg-zinc-950/75 px-3 text-xs font-medium text-white/85 shadow-lg shadow-black/30 backdrop-blur transition-colors hover:border-white/30 hover:bg-zinc-900 hover:text-white"
      >
        <Bug className="h-4 w-4" />
        Report issue or new feature
      </button>
    </div>
  )
}
