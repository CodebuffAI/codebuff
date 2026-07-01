'use client'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { DISCORD_URL } from '@/components/landing/nav-links'
import {
  ISSUE_REPORT_CATEGORIES,
  type IssueReportCategory,
} from '@/vly/lib/issue-report-categories'
import { useSignedInUser } from '@/vly/hooks/use-user'
import { cn } from '@/vly/lib/utils'
import { useAction, useMutation, useQuery } from 'convex/react'
import {
  ArrowLeft,
  Bug,
  ImagePlus,
  Lightbulb,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

type IssueSource = 'chat' | 'cloud'
type ReportType = 'bug' | 'feature_request'

type ScreenshotPreview = {
  storageId: Id<'_storage'>
  previewUrl: string
}

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
  const generateUploadUrl = useMutation(api.issue_reports.generateUploadUrl)
  const quota = useQuery(api.issue_reports.getDailyQuota, {})

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [reportType, setReportType] = useState<ReportType>('bug')
  const [severity, setSeverity] = useState(3)
  const [category, setCategory] = useState<IssueReportCategory>('other')
  const [bugDescription, setBugDescription] = useState('')
  const [reproductionSteps, setReproductionSteps] = useState('')
  const [additionalLogs, setAdditionalLogs] = useState('')
  const [featureDescription, setFeatureDescription] = useState('')
  const [screenshots, setScreenshots] = useState<ScreenshotPreview[]>([])
  const [replyEmail, setReplyEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false)
  const [rateLimited, setRateLimited] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!open) setStep(1)
  }, [open])

  const resetForm = useCallback(() => {
    setBugDescription('')
    setReproductionSteps('')
    setAdditionalLogs('')
    setFeatureDescription('')
    setScreenshots([])
    setReportType('bug')
    setCategory('other')
    setSeverity(3)
    setStep(1)
  }, [])

  const uploadImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error('Screenshots must be image files')
        return
      }

      setUploadingScreenshot(true)
      try {
        const [uploadUrl, previewUrl] = await Promise.all([
          generateUploadUrl(),
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (event) => resolve(event.target?.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          }),
        ])

        const result = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        })
        if (!result.ok) {
          throw new Error(`Upload failed with status ${result.status}`)
        }

        const { storageId } = await result.json()
        if (!storageId) {
          throw new Error('Upload response missing storageId')
        }

        setScreenshots((prev) => [
          ...prev,
          { storageId, previewUrl },
        ])
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not upload screenshot'
        toast.error(message)
      } finally {
        setUploadingScreenshot(false)
      }
    },
    [generateUploadUrl],
  )

  const handleScreenshotSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      await uploadImageFile(file)
    }
    event.target.value = ''
  }

  useEffect(() => {
    if (!open || step !== 2 || reportType !== 'bug') return

    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return

      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (!file) continue
        event.preventDefault()
        void uploadImageFile(file)
        return
      }
    }

    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [open, reportType, step, uploadImageFile])

  const severityColor = useMemo(() => {
    const hue = 125 - severity * 12.5
    return `hsl(${hue} 78% 45%)`
  }, [severity])
  const scaleLabel = reportType === 'feature_request' ? 'Urgency' : 'Severity'
  const reportLabel =
    reportType === 'feature_request' ? 'Feature request' : 'Bug report'

  const overLimit = rateLimited || (quota ? quota.remaining <= 0 : false)
  const canSubmit =
    replyEmail.trim().length > 0 &&
    !submitting &&
    !uploadingScreenshot &&
    (reportType === 'feature_request'
      ? featureDescription.trim().length > 0
      : bugDescription.trim().length > 0 &&
        reproductionSteps.trim().length > 0 &&
        screenshots.length > 0)

  const selectType = (type: ReportType) => {
    setReportType(type)
    setStep(2)
  }

  const removeScreenshot = (storageId: Id<'_storage'>) => {
    setScreenshots((prev) => prev.filter((item) => item.storageId !== storageId))
  }

  const handleSubmit = async () => {
    if (!canSubmit) return

    try {
      setSubmitting(true)
      const result = await submitIssueReport({
        source,
        reportType,
        severity,
        issue:
          reportType === 'bug'
            ? bugDescription.trim()
            : featureDescription.trim(),
        category: reportType === 'bug' ? category : undefined,
        reproductionSteps:
          reportType === 'bug' ? reproductionSteps.trim() : undefined,
        additionalLogs:
          reportType === 'bug' && additionalLogs.trim()
            ? additionalLogs.trim()
            : undefined,
        screenshotIds:
          reportType === 'bug'
            ? screenshots.map((item) => item.storageId)
            : undefined,
        replyEmail: replyEmail.trim(),
        pageUrl: window.location.href,
        userAgent: window.navigator.userAgent,
        threadId: threadId ?? undefined,
        projectId,
        projectSemanticIdentifier,
      })
      resetForm()
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
        <div className="absolute bottom-full right-0 z-50 mb-2 flex max-h-[min(72vh,560px)] w-[min(92vw,360px)] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
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
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat with the community on Discord"
              title="Chat with the community on Discord"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-[#5865F2]"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
          </div>

          {overLimit ? (
            <div className="space-y-2.5 overflow-y-auto p-3">
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
            <div className="space-y-2.5 overflow-y-auto p-3">
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
              ) : reportType === 'bug' ? (
                <>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <Bug className="h-3.5 w-3.5" />
                    Bug report
                  </div>

                  <label className="block space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Category of issue
                    </span>
                    <select
                      value={category}
                      onChange={(event) =>
                        setCategory(event.target.value as IssueReportCategory)
                      }
                      className={cn(fieldClass, 'h-9')}
                    >
                      {ISSUE_REPORT_CATEGORIES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

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
                      What is the bug?
                    </span>
                    <textarea
                      value={bugDescription}
                      onChange={(event) => setBugDescription(event.target.value)}
                      maxLength={5000}
                      rows={3}
                      autoFocus
                      placeholder="Describe the bug as clearly as possible."
                      className={cn(fieldClass, 'resize-none py-2 leading-5')}
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      How to reproduce the bug?
                    </span>
                    <textarea
                      value={reproductionSteps}
                      onChange={(event) =>
                        setReproductionSteps(event.target.value)
                      }
                      maxLength={5000}
                      rows={3}
                      placeholder="List the exact steps you took to reproduce it."
                      className={cn(fieldClass, 'resize-none py-2 leading-5')}
                    />
                  </label>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Screenshot (required)
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Paste or upload
                      </span>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => void handleScreenshotSelect(event)}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingScreenshot}
                      className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-background text-[12px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploadingScreenshot ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5" />
                      )}
                      Add screenshot
                    </button>
                    {screenshots.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {screenshots.map((screenshot) => (
                          <div
                            key={screenshot.storageId}
                            className="relative overflow-hidden rounded-md border border-border"
                          >
                            <img
                              src={screenshot.previewUrl}
                              alt="Bug screenshot"
                              className="h-20 w-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                removeScreenshot(screenshot.storageId)
                              }
                              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                              aria-label="Remove screenshot"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <label className="block space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Additional logs / context (optional)
                    </span>
                    <textarea
                      value={additionalLogs}
                      onChange={(event) => setAdditionalLogs(event.target.value)}
                      maxLength={10000}
                      rows={2}
                      placeholder="Paste console errors, logs, or anything else helpful."
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
                    Send bug report
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <Lightbulb className="h-3.5 w-3.5" />
                    Feature request
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
                      Feature
                    </span>
                    <textarea
                      value={featureDescription}
                      onChange={(event) =>
                        setFeatureDescription(event.target.value)
                      }
                      maxLength={5000}
                      rows={4}
                      autoFocus
                      placeholder="What would you like us to add?"
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
        <span
          title="Approved reports are picked up by our AI bug fixer, which ships fix PRs automatically"
          className="ml-0.5 inline-flex items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
        >
          <Sparkles className="h-2.5 w-2.5" />
          AI-fixed
        </span>
      </button>
    </div>
  )
}
