'use node'

import { Resend } from 'resend'
import { v } from 'convex/values'
import { action } from './_generated/server'
import { internal } from './_generated/api'
import { getAuthUser } from './users'
import type { Id } from './_generated/dataModel'

const FREEBUFF_FROM_EMAIL = 'Freebuff Reports <james@mail.freebuff.app>'
const ISSUE_REPORT_RECIPIENTS = [
  'victor@codebuff.com',
  'victor@vly.ai',
  'harsh@vly.ai',
]
const MAX_ISSUE_LENGTH = 5000

type SubmitIssueReportResult = {
  reportId: Id<'issue_reports'>
  emailSent: boolean
  emailError?: string
}

function clampSeverity(severity: number): number {
  if (!Number.isFinite(severity)) return 0
  return Math.min(10, Math.max(0, Math.round(severity)))
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export const submitIssueReport = action({
  args: {
    replyEmail: v.string(),
    reportType: v.union(v.literal('bug'), v.literal('feature_request')),
    severity: v.number(),
    issue: v.string(),
    source: v.union(v.literal('chat'), v.literal('cloud')),
    pageUrl: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    threadId: v.optional(v.string()),
    projectId: v.optional(v.id('project')),
    projectSemanticIdentifier: v.optional(v.string()),
  },
  returns: v.object({
    reportId: v.id('issue_reports'),
    emailSent: v.boolean(),
    emailError: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<SubmitIssueReportResult> => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const replyEmail = args.replyEmail.trim().toLowerCase()
    if (!isLikelyEmail(replyEmail)) {
      throw new Error('Enter a valid reply email')
    }

    const issue = truncate(args.issue.trim(), MAX_ISSUE_LENGTH)
    if (!issue) {
      throw new Error('Describe the issue before sending')
    }

    const severity = clampSeverity(args.severity)
    const reportId: Id<'issue_reports'> = await ctx.runMutation(
      internal.issue_reports.insertIssueReport,
      {
        userId: user._id,
        recordedUserName: user.name,
        recordedUserEmail: user.email,
        replyEmail,
        reportType: args.reportType,
        severity,
        issue,
        source: args.source,
        pageUrl: args.pageUrl,
        userAgent: args.userAgent,
        threadId: args.threadId,
        projectId: args.projectId,
        projectSemanticIdentifier: args.projectSemanticIdentifier,
      },
    )

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      const emailError = 'RESEND_API_KEY not configured'
      await ctx.runMutation(internal.issue_reports.updateEmailStatus, {
        reportId,
        emailSendStatus: 'failed',
        emailError,
      })
      return { reportId, emailSent: false, emailError }
    }

    const reportLabel =
      args.reportType === 'feature_request' ? 'Feature request' : 'Bug report'
    const scaleLabel =
      args.reportType === 'feature_request' ? 'Urgency' : 'Severity'
    const subject = `[Freebuff ${reportLabel.toLowerCase()} ${severity}/10] ${args.source}`
    const contextLines = [
      `Type: ${reportLabel}`,
      `${scaleLabel}: ${severity}/10`,
      `Source: ${args.source}`,
      `Reply email: ${replyEmail}`,
      `User: ${user.name || 'Unknown'} <${user.email || 'unknown'}>`,
      args.projectSemanticIdentifier
        ? `Project: ${args.projectSemanticIdentifier}`
        : null,
      args.threadId ? `Thread: ${args.threadId}` : null,
      args.pageUrl ? `URL: ${args.pageUrl}` : null,
    ].filter(Boolean)

    const text = [
      `New Freebuff ${reportLabel.toLowerCase()}`,
      '',
      ...contextLines,
      '',
      'Issue:',
      issue,
    ].join('\n')

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
        <h2 style="margin: 0 0 12px;">New Freebuff ${escapeHtml(reportLabel.toLowerCase())}</h2>
        <table style="border-collapse: collapse; margin-bottom: 16px;">
          ${contextLines
            .map((line) => {
              const [label, ...rest] = String(line).split(': ')
              return `<tr><td style="padding: 3px 12px 3px 0; color: #555;">${escapeHtml(label)}</td><td style="padding: 3px 0;">${escapeHtml(rest.join(': '))}</td></tr>`
            })
            .join('')}
        </table>
        <div style="white-space: pre-wrap; border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: #fafafa;">${escapeHtml(issue)}</div>
      </div>
    `

    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: FREEBUFF_FROM_EMAIL,
      replyTo: replyEmail,
      to: ISSUE_REPORT_RECIPIENTS,
      subject,
      text,
      html,
    })

    if (error) {
      await ctx.runMutation(internal.issue_reports.updateEmailStatus, {
        reportId,
        emailSendStatus: 'failed',
        emailError: error.message,
      })
      return { reportId, emailSent: false, emailError: error.message }
    }

    await ctx.runMutation(internal.issue_reports.updateEmailStatus, {
      reportId,
      emailSendStatus: 'sent',
    })
    return { reportId, emailSent: true }
  },
})
