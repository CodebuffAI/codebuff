'use client'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { issueReportCategoryLabel } from '@/vly/lib/issue-report-categories'
import { Badge } from '@/vly/components/ui/badge'
import { Button } from '@/vly/components/ui/button'
import { Skeleton } from '@/vly/components/ui/skeleton'
import { cn } from '@/vly/lib/utils'
import { useMutation, useQuery } from 'convex/react'
import { ExternalLink, Mail, MessageSquareWarning } from 'lucide-react'
import { toast } from 'sonner'

type IssueStatus = 'open' | 'reviewing' | 'resolved'

const STATUS_OPTIONS: Array<{ value: 'all' | IssueStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'resolved', label: 'Resolved' },
]

function severityClass(severity: number): string {
  if (severity >= 8) return 'border-red-200 bg-red-50 text-red-700'
  if (severity >= 5) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-green-200 bg-green-50 text-green-700'
}

function statusClass(status: IssueStatus): string {
  if (status === 'resolved')
    return 'border-green-200 bg-green-50 text-green-700'
  if (status === 'reviewing') return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-red-200 bg-red-50 text-red-700'
}

function emailStatusClass(status: 'pending' | 'sent' | 'failed'): string {
  if (status === 'sent') return 'border-green-200 bg-green-50 text-green-700'
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700'
  return 'border-gray-200 bg-gray-50 text-gray-700'
}

function reportTypeLabel(type?: 'bug' | 'feature_request'): string {
  return type === 'feature_request' ? 'Feature request' : 'Bug report'
}

export function IssueReportsView({
  statusFilter,
  setStatusFilter,
}: {
  statusFilter: string
  setStatusFilter: (status: string) => void
}) {
  const reports = useQuery(
    api.issue_reports.listAll,
    statusFilter === 'all' ? {} : { status: statusFilter as IssueStatus },
  )
  const updateStatus = useMutation(api.issue_reports.updateStatus)

  const handleStatusChange = async (
    reportId: Id<'issue_reports'>,
    status: IssueStatus,
  ) => {
    try {
      await updateStatus({ reportId, status })
      toast.success('Issue status updated')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not update issue',
      )
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Issue Reports</h2>
          <p className="mt-1 text-sm text-gray-600">
            Feedback and bug reports submitted from chat and cloud.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={statusFilter === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {reports === undefined ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center shadow-sm">
          <MessageSquareWarning className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p className="font-medium text-black">No issue reports found</p>
          <p className="mt-1 text-sm text-gray-500">
            New reports will appear here as users submit them.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const reportType = report.reportType ?? 'bug'
            const scaleLabel =
              reportType === 'feature_request' ? 'urgency' : 'severity'
            return (
              <div
                key={report._id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge className={severityClass(report.severity)}>
                        {scaleLabel} {report.severity}/10
                      </Badge>
                      <Badge className="border-gray-200 bg-gray-50 text-gray-700">
                        {reportTypeLabel(reportType)}
                      </Badge>
                      <Badge className={statusClass(report.status)}>
                        {report.status}
                      </Badge>
                      <Badge className="border-gray-200 bg-gray-50 text-gray-700">
                        {report.source}
                      </Badge>
                      {report.category && (
                        <Badge className="border-purple-200 bg-purple-50 text-purple-700">
                          {issueReportCategoryLabel(report.category)}
                        </Badge>
                      )}
                      <Badge
                        className={emailStatusClass(report.emailSendStatus)}
                      >
                        email {report.emailSendStatus}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(report.submittedAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="whitespace-pre-wrap text-sm leading-6 text-gray-900">
                      {report.issue}
                    </p>

                    {report.reproductionSteps && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          How to reproduce
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-800">
                          {report.reproductionSteps}
                        </p>
                      </div>
                    )}

                    {report.additionalLogs && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Additional logs
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-800">
                          {report.additionalLogs}
                        </p>
                      </div>
                    )}

                    {report.screenshotUrls && report.screenshotUrls.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {report.screenshotUrls.map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden rounded-md border border-gray-200"
                          >
                            <img
                              src={url}
                              alt="Issue screenshot"
                              className="h-24 w-32 object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span>
                        User: {report.userName}
                        {report.userEmail ? ` (${report.userEmail})` : ''}
                      </span>
                      <a
                        href={`mailto:${report.replyEmail}`}
                        className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {report.replyEmail}
                      </a>
                      {report.projectSemanticIdentifier && (
                        <span>Project: {report.projectSemanticIdentifier}</span>
                      )}
                      {report.threadId && (
                        <span>Thread: {report.threadId}</span>
                      )}
                      {report.pageUrl && (
                        <a
                          href={report.pageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                        >
                          Page
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    {report.emailError && (
                      <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
                        Email error: {report.emailError}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                    {(['open', 'reviewing', 'resolved'] as const).map(
                      (status) => (
                        <Button
                          key={status}
                          type="button"
                          size="sm"
                          variant={
                            report.status === status ? 'default' : 'outline'
                          }
                          className={cn(
                            'capitalize',
                            report.status === status && 'pointer-events-none',
                          )}
                          onClick={() =>
                            void handleStatusChange(report._id, status)
                          }
                        >
                          {status}
                        </Button>
                      ),
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
