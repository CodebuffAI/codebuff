'use client'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { useSignedInUser } from '@/vly/hooks/use-user'
import { cn } from '@/vly/lib/utils'
import { useAction } from 'convex/react'
import { ArrowLeft, Bug, Lightbulb, Loader2, Send } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
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
  const [step, setStep] = useState<1 | 2>(1)
  const [reportType, setReportType] = useState<ReportType>('bug')
  const [severity, setSeverity] = useState(3)
  const [issue, setIssue] = useState('')
  const [replyEmail, setReplyEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
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

  const canAdvance = replyEmail.trim().length > 0
  const canSubmit = issue.trim().length > 0 && canAdvance && !submitting

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

  // Cursor-inspired field styling: flat dark surfaces, hard corners, blue focus.
  const fieldClass =
    'w-full rounded-none border border-[#2b2b2b] bg-[#0d0d0d] px-2.5 text-[13px] text-[#e6e6e6] outline-none transition-colors placeholder:text-[#5a5a5a] focus:border-[#2f81f7]'

  return (
    <div ref={containerRef} className={cn('relative inline-flex', className)}>
      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-[280px] rounded-none border border-[#2b2b2b] bg-[#161616] text-[#e6e6e6] shadow-xl shadow-black/40">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-[#242424] px-3 py-2">
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                aria-label="Back"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-none text-[#8a8a8a] transition-colors hover:bg-[#242424] hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-[12px] font-medium leading-tight text-[#e6e6e6]">
                Report issue or feature
              </h2>
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-[#6a6a6a]">
              {step}/2
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2.5 p-3">
            {step === 1 ? (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setReportType('bug')}
                    className={cn(
                      'flex h-8 items-center justify-center gap-1.5 rounded-none border px-2 text-[12px] font-medium transition-colors',
                      reportType === 'bug'
                        ? 'border-[#2f81f7] bg-[#2f81f7]/10 text-white'
                        : 'border-[#2b2b2b] bg-[#0d0d0d] text-[#8a8a8a] hover:border-[#3a3a3a] hover:text-[#e6e6e6]',
                    )}
                  >
                    <Bug className="h-3.5 w-3.5" />
                    Bug
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportType('feature_request')}
                    className={cn(
                      'flex h-8 items-center justify-center gap-1.5 rounded-none border px-2 text-[12px] font-medium transition-colors',
                      reportType === 'feature_request'
                        ? 'border-[#2f81f7] bg-[#2f81f7]/10 text-white'
                        : 'border-[#2b2b2b] bg-[#0d0d0d] text-[#8a8a8a] hover:border-[#3a3a3a] hover:text-[#e6e6e6]',
                    )}
                  >
                    <Lightbulb className="h-3.5 w-3.5" />
                    Feature
                  </button>
                </div>

                <label className="block space-y-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[#6a6a6a]">
                    Reply email
                  </span>
                  <input
                    type="email"
                    value={replyEmail}
                    onChange={(event) => setReplyEmail(event.target.value)}
                    placeholder="you@example.com"
                    className={cn(fieldClass, 'h-8')}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => canAdvance && setStep(2)}
                  disabled={!canAdvance}
                  className="flex h-8 w-full items-center justify-center rounded-none bg-[#2f81f7] text-[12px] font-semibold text-white transition-colors hover:bg-[#4a93ff] disabled:cursor-not-allowed disabled:bg-[#242424] disabled:text-[#5a5a5a]"
                >
                  Next
                </button>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[#6a6a6a]">
                      {scaleLabel}
                    </span>
                    <span
                      className="rounded-none px-1.5 py-0.5 text-[10px] font-semibold text-white"
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
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-none accent-current"
                    style={{
                      color: severityColor,
                      background: `linear-gradient(90deg, #22c55e 0%, ${severityColor} ${severity * 10}%, #ef4444 100%)`,
                    }}
                  />
                </div>

                <label className="block space-y-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[#6a6a6a]">
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
                  type="submit"
                  disabled={!canSubmit}
                  className="flex h-8 w-full items-center justify-center gap-1.5 rounded-none bg-[#2f81f7] text-[12px] font-semibold text-white transition-colors hover:bg-[#4a93ff] disabled:cursor-not-allowed disabled:bg-[#242424] disabled:text-[#5a5a5a]"
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
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Report issue or new feature"
        className={cn(
          'inline-flex items-center gap-1 rounded-none text-[11px] font-medium text-muted-foreground/60 transition-colors hover:text-muted-foreground',
          open && 'text-muted-foreground',
        )}
      >
        <Bug className="h-3 w-3" />
        Report issue
      </button>
    </div>
  )
}
