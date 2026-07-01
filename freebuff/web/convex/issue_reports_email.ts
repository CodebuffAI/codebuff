'use node'

import { Resend } from 'resend'
import { v } from 'convex/values'
import { action } from './_generated/server'
import { internal } from './_generated/api'
import {
  issueCategoryLabel,
  issueCategoryValidator,
} from './issue_reports'
import { getAuthUser } from './users'
import type { Id } from './_generated/dataModel'

const FREEBUFF_FROM_EMAIL = 'Freebuff Reports <james@mail.freebuff.app>'
const ISSUE_REPORT_RECIPIENTS = [
  'victor@codebuff.com',
  'victor@vly.ai',
  'harsh@vly.ai',
]
const MAX_ISSUE_LENGTH = 5000
const MAX_REPRODUCTION_LENGTH = 5000
const MAX_LOGS_LENGTH = 10000

type SubmitIssueReportResult = {
  reportId: Id<'issue_reports'>
  emailSent: boolean
  emailError?: string
}

type ThreadContextMessage = {
  role: string
  content: string
  date?: number
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

function projectLink(
  source: 'chat' | 'cloud',
  semanticIdentifier?: string,
  pageUrl?: string,
): string | null {
  if (pageUrl) return pageUrl
  if (!semanticIdentifier) return null
  const base =
    source === 'cloud'
      ? `https://freebuff.com/cloud/project/${semanticIdentifier}`
      : `https://freebuff.com/web/project/${semanticIdentifier}`
  return base
}

function formatThreadContext(messages: ThreadContextMessage[]): string[] {
  if (messages.length === 0) return []
  return [
    '',
    'Recent thread messages:',
    ...messages.map((message) => {
      const timestamp = message.date
        ? new Date(message.date).toISOString()
        : 'unknown time'
      return `[${message.role} @ ${timestamp}]\n${message.content}`
    }),
  ]
}

function renderThreadContextHtml(messages: ThreadContextMessage[]): string {
  if (messages.length === 0) return ''
  return `
    <h3 style="margin: 20px 0 8px;">Recent thread messages</h3>
    ${messages
      .map((message) => {
        const timestamp = message.date
          ? new Date(message.date).toLocaleString()
          : 'unknown time'
        return `<div style="margin-bottom: 10px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; background: #fafafa;">
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 6px;"><strong>${escapeHtml(message.role)}</strong> · ${escapeHtml(timestamp)}</div>
          <div style="white-space: pre-wrap; font-size: 13px;">${escapeHtml(message.content)}</div>
        </div>`
      })
      .join('')}
  `
}

export const submitIssueReport = action({
  args: {
    replyEmail: v.string(),
    reportType: v.union(v.literal('bug'), v.literal('feature_request')),
    severity: v.number(),
    issue: v.string(),
    category: v.optional(issueCategoryValidator),
    reproductionSteps: v.optional(v.string()),
    additionalLogs: v.optional(v.string()),
    screenshotIds: v.optional(v.array(v.id('_storage'))),
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

    const reproductionSteps = args.reproductionSteps
      ? truncate(args.reproductionSteps.trim(), MAX_REPRODUCTION_LENGTH)
      : undefined
    const additionalLogs = args.additionalLogs
      ? truncate(args.additionalLogs.trim(), MAX_LOGS_LENGTH)
      : undefined
    const screenshotIds = args.screenshotIds ?? []

    if (args.reportType === 'bug') {
      if (!args.category) {
        throw new Error('Select a bug category')
      }
      if (!reproductionSteps) {
        throw new Error('Describe how to reproduce the bug')
      }
      if (screenshotIds.length === 0) {
        throw new Error('Attach at least one screenshot of the issue')
      }
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
        category: args.category,
        reproductionSteps,
        additionalLogs,
        screenshotIds: screenshotIds.length > 0 ? screenshotIds : undefined,
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

    const [recentMessages, screenshotUrls] = await Promise.all([
      ctx.runQuery(internal.issue_reports.getRecentThreadContext, {
        source: args.source,
        threadId: args.threadId,
        limit: 6,
      }),
      screenshotIds.length > 0
        ? ctx.runQuery(internal.issue_reports.getScreenshotUrls, {
            screenshotIds,
          })
        : Promise.resolve([]),
    ])

    const validScreenshotUrls = screenshotUrls.filter(
      (url): url is string => typeof url === 'string' && url.length > 0,
    )

    const reportLabel =
      args.reportType === 'feature_request' ? 'Feature request' : 'Bug report'
    const scaleLabel =
      args.reportType === 'feature_request' ? 'Urgency' : 'Severity'
    const categoryLabel =
      args.reportType === 'bug'
        ? issueCategoryLabel(args.category)
        : undefined
    const link = projectLink(
      args.source,
      args.projectSemanticIdentifier,
      args.pageUrl,
    )

    const subjectParts = [
      `[Freebuff ${reportLabel.toLowerCase()} ${severity}/10]`,
      categoryLabel ?? args.source,
    ]
    const subject = subjectParts.join(' · ')

    const contextLines = [
      `Type: ${reportLabel}`,
      categoryLabel ? `Category: ${categoryLabel}` : null,
      `${scaleLabel}: ${severity}/10`,
      `Source: ${args.source}`,
      `Reply email: ${replyEmail}`,
      `User: ${user.name || 'Unknown'} <${user.email || 'unknown'}>`,
      args.projectSemanticIdentifier
        ? `Project: ${args.projectSemanticIdentifier}`
        : null,
      link ? `Project link: ${link}` : null,
      args.threadId ? `Thread: ${args.threadId}` : null,
      args.pageUrl ? `Page URL: ${args.pageUrl}` : null,
      args.userAgent ? `User agent: ${args.userAgent}` : null,
    ].filter(Boolean)

    const detailSections =
      args.reportType === 'bug'
        ? [
            '',
            'What is the bug?',
            issue,
            '',
            'How to reproduce:',
            reproductionSteps ?? '',
            additionalLogs
              ? ''
              : null,
            additionalLogs ? 'Additional logs / context:' : null,
            additionalLogs ?? null,
          ].filter((line): line is string => line !== null)
        : ['', 'Request:', issue]

    const screenshotLines =
      validScreenshotUrls.length > 0
        ? [
            '',
            'Screenshots:',
            ...validScreenshotUrls.map((url, index) => `${index + 1}. ${url}`),
          ]
        : []

    const text = [
      `New Freebuff ${reportLabel.toLowerCase()}`,
      '',
      ...contextLines,
      ...detailSections,
      ...screenshotLines,
      ...formatThreadContext(recentMessages),
    ].join('\n')

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
        <h2 style="margin: 0 0 12px;">New Freebuff ${escapeHtml(reportLabel.toLowerCase())}</h2>
        <table style="border-collapse: collapse; margin-bottom: 16px;">
          ${contextLines
            .map((line) => {
              const [label, ...rest] = String(line).split(': ')
              const value = rest.join(': ')
              const linkedValue =
                label === 'Project link' && value
                  ? `<a href="${escapeHtml(value)}" style="color: #2563eb;">${escapeHtml(value)}</a>`
                  : escapeHtml(value)
              return `<tr><td style="padding: 3px 12px 3px 0; color: #555; vertical-align: top;">${escapeHtml(label)}</td><td style="padding: 3px 0;">${linkedValue}</td></tr>`
            })
            .join('')}
        </table>
        ${
          args.reportType === 'bug'
            ? `
              <h3 style="margin: 0 0 8px;">What is the bug?</h3>
              <div style="white-space: pre-wrap; border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: #fafafa; margin-bottom: 16px;">${escapeHtml(issue)}</div>
              <h3 style="margin: 0 0 8px;">How to reproduce</h3>
              <div style="white-space: pre-wrap; border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: #fafafa; margin-bottom: 16px;">${escapeHtml(reproductionSteps ?? '')}</div>
              ${
                additionalLogs
                  ? `<h3 style="margin: 0 0 8px;">Additional logs / context</h3>
                     <div style="white-space: pre-wrap; border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: #fafafa; margin-bottom: 16px;">${escapeHtml(additionalLogs)}</div>`
                  : ''
              }
            `
            : `<h3 style="margin: 0 0 8px;">Request</h3>
               <div style="white-space: pre-wrap; border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: #fafafa; margin-bottom: 16px;">${escapeHtml(issue)}</div>`
        }
        ${
          validScreenshotUrls.length > 0
            ? `<h3 style="margin: 0 0 8px;">Screenshots</h3>
               <div style="display: grid; gap: 12px; margin-bottom: 16px;">
                 ${validScreenshotUrls
                   .map(
                     (url) =>
                       `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(url)}" alt="Bug screenshot" style="max-width: 100%; border: 1px solid #ddd; border-radius: 8px;" /></a>`,
                   )
                   .join('')}
               </div>`
            : ''
        }
        ${renderThreadContextHtml(recentMessages)}
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
