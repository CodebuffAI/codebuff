'use client'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { DISCORD_URL } from '@/components/landing/nav-links'
import { useSignedInUser } from '@/vly/hooks/use-user'
import { cn } from '@/vly/lib/utils'
import { useAction, useQuery } from 'convex/react'
import { ArrowLeft, Bug, Lightbulb, Loader2, Send } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  const quota = useQuery(api.issue_reports.getDailyQuota, {})

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [reportType, setReportType] = useState<ReportType>('bug')
  const [severity, setSeverity] = useState(3)
  const [issue, setIssue] = useState('')
  const [replyEmail, setReplyEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [rateLimited, setRateLimited] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  // Reset to the first step whenever the popover is closed.
  useEffect(() => {
    if (!open) setStep(1)
  }, [open])

  const severityColor = useMemo(() => {
    const hue = 125 - severity * 12.5
    return `hsl(${hue} 78% 45%)`
  }, [severity])
  const scaleLabel = reportType === 'feature_request' ? 'Urgency' : 'Severity'
  const reportLabel =
    reportType === 'feature_request' ? 'Feature request' : 'Bug report'

  const overLimit = rateLimited || (quota ? quota.remaining <= 0 : false)
  const canSubmit =
    issue.trim().length > 0 && replyEmail.trim().length > 0 && !submitting

  const selectType = (type: ReportType) => {
    setReportType(type)
    setStep(2)
  }

  const handleSubmit = async () => {
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
      setStep(1)
      setOpen(false)
      toast.success(
        result.emailSent
          ? `${reportLabel} sent. We will follow up by email.`
          : `${reportLabel} saved. Email delivery will be checked by the team.`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not report issue'
      if (message.includes('RATE_LIMITED')) {
        setRateLimited(true)
        return
      }
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const fieldClass =
    'w-full rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-1 focus:ring-ring'

  const typeButtonClass = (active: boolean) =>
    cn(
      'flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-[12px] font-medium transition-colors',
      active
        ? 'border-primary bg-primary/10 text-foreground'
        : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
    )

  return (
    <div ref={containerRef} className={cn('relative inline-flex', className)}>
      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-[280px] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            {step === 2 && !overLimit && (
              <button
                type="button"
                onClick={() => setStep(1)}
                aria-label="Back"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-[12px] font-medium leading-tight">
                Report issue or feature
              </h2>
            </div>
            {!overLimit && (
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {step}/2
              </span>
            )}
          </div>

          {overLimit ? (
            <div className="space-y-2.5 p-3">
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                You&apos;ve hit the daily limit of {quota?.limit ?? 2} reports.
                For anything else today, please reach us in Discord and
                we&apos;ll help you out.
              </p>
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 w-full items-center justify-center rounded-md bg-primary text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Report in Discord
              </a>
            </div>
          ) : (
            // Plain div, not <form> — this popover is rendered inside the
            // chat composer's own <form>, and nested <form> elements trigger
            // unpredictable native submission (full page reload) in browsers.
            <div className="space-y-2.5 p-3">
              {step === 1 ? (
                <>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Reply email
                    </span>
                    <input
                      type="email"
                      value={replyEmail}
                      onChange={(event) => setReplyEmail(event.target.value)}
                      placeholder="you@example.com"
                      className={cn(fieldClass, 'h-9')}
                    />
                  </label>

                  <div className="space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      What would you like to share?
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => selectType('bug')}
                        className={typeButtonClass(false)}
                      >
                        <Bug className="h-3.5 w-3.5" />
                        Bug
                      </button>
                      <button
                        type="button"
                        onClick={() => selectType('feature_request')}
                        className={typeButtonClass(false)}
                      >
                        <Lightbulb className="h-3.5 w-3.5" />
                        Feature
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    {reportType === 'feature_request' ? (
                      <Lightbulb className="h-3.5 w-3.5" />
                    ) : (
                      <Bug className="h-3.5 w-3.5" />
                    )}
                    {reportLabel}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {scaleLabel}
                      </span>
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white"
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
                      onChange={(event) =>
                        setSeverity(Number(event.target.value))
                      }
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-current"
                      style={{
                        color: severityColor,
                        background: `linear-gradient(90deg, #22c55e 0%, ${severityColor} ${severity * 10}%, #ef4444 100%)`,
                      }}
                    />
                  </div>

                  <label className="block space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {reportType === 'feature_request' ? 'Feature' : 'Issue'}
                    </span>
                    <textarea
                      value={issue}
                      onChange={(event) => setIssue(event.target.value)}
                      maxLength={5000}
                      rows={4}
                      autoFocus
                      placeholder={
                        reportType === 'feature_request'
                          ? 'What would you like us to add?'
                          : 'What happened?'
                      }
                      className={cn(fieldClass, 'resize-none py-2 leading-5')}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Send report
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Report issue or new feature"
        className={cn(
          'inline-flex items-center gap-1 pr-2 text-[11px] font-medium text-muted-foreground/60 transition-colors hover:text-muted-foreground',
          open && 'text-muted-foreground',
        )}
      >
        <Bug className="h-3 w-3" />
        Report issue or feature
      </button>
    </div>
  )
}
