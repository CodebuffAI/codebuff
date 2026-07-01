import { v } from 'convex/values'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { getAuthUser } from './users'
import type { Id } from './_generated/dataModel'

const issueReportStatusValidator = v.union(
  v.literal('open'),
  v.literal('reviewing'),
  v.literal('resolved'),
)

const emailSendStatusValidator = v.union(
  v.literal('pending'),
  v.literal('sent'),
  v.literal('failed'),
)

const reportTypeValidator = v.union(
  v.literal('bug'),
  v.literal('feature_request'),
)

export const issueCategoryValidator = v.union(
  v.literal('agent_response'),
  v.literal('ui_ux'),
  v.literal('deployment'),
  v.literal('previews'),
  v.literal('github_sync'),
  v.literal('integrations'),
  v.literal('backend'),
  v.literal('other'),
)

// Anti-abuse: cap combined bug reports + feature requests per user per day.
export const MAX_ISSUE_REPORTS_PER_DAY = 2
const ISSUE_REPORT_WINDOW_MS = 24 * 60 * 60 * 1000

const CATEGORY_LABELS: Record<string, string> = {
  agent_response: 'Agent Response',
  ui_ux: 'UI/UX',
  deployment: 'Deployment',
  previews: 'Previews',
  github_sync: 'Github Sync',
  integrations: 'Integrations',
  backend: 'Backend',
  other: 'Other',
}

export function issueCategoryLabel(category: string | undefined): string {
  if (!category) return 'Other'
  return CATEGORY_LABELS[category] ?? category
}

async function countRecentReports(
  ctx: { db: any },
  userId: any,
): Promise<number> {
  const cutoff = Date.now() - ISSUE_REPORT_WINDOW_MS
  const recent = await ctx.db
    .query('issue_reports')
    .withIndex('by_user', (q: any) => q.eq('userId', userId))
    .collect()
  return recent.filter((r: any) => r.submittedAt >= cutoff).length
}

function truncateContent(value: string, maxLength: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength)}…`
}

function getAgentAssistantText(
  assistantStream:
    | Array<{ type: string; content: string }>
    | undefined,
): string {
  return (assistantStream ?? [])
    .filter((item) => item.type === 'text' || item.type === 'assistant')
    .map((item) => item.content)
    .join('')
    .trim()
}

export const getRecentThreadContext = internalQuery({
  args: {
    source: v.union(v.literal('chat'), v.literal('cloud')),
    threadId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      role: v.string(),
      content: v.string(),
      date: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    if (!args.threadId) return []

    const limit = Math.min(args.limit ?? 6, 10)

    if (args.source === 'cloud') {
      const messages = await ctx.db
        .query('agent_message')
        .withIndex('by_thread_active', (q) =>
          q
            .eq('thread_id', args.threadId as Id<'agent_thread'>)
            .eq('isStreaming', false)
            .eq('deactivated', false),
        )
        .order('desc')
        .take(limit)

      const context: Array<{
        role: string
        content: string
        date?: number
      }> = []

      for (const message of messages.reverse()) {
        if (message.user_message?.trim()) {
          context.push({
            role: 'user',
            content: truncateContent(message.user_message, 800),
            date: message._creationTime,
          })
        }
        const assistantText = getAgentAssistantText(message.assistant_stream)
        if (assistantText) {
          context.push({
            role: 'assistant',
            content: truncateContent(assistantText, 800),
            date: message._creationTime,
          })
        }
      }

      return context.slice(-limit)
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_thread', (q) =>
        q
          .eq('thread_id', args.threadId as Id<'thread'>)
          .eq('streaming', false),
      )
      .order('desc')
      .filter((q) => q.neq(q.field('deactivated'), true))
      .take(limit)

    return messages
      .reverse()
      .map((message) => ({
        role: message.role,
        content: truncateContent(
          message.core_message || message.content || '',
          800,
        ),
        date: message.date ?? message._creationTime,
      }))
      .filter((message) => message.content.length > 0)
  },
})

export const getScreenshotUrls = internalQuery({
  args: {
    screenshotIds: v.array(v.id('_storage')),
  },
  returns: v.array(v.union(v.string(), v.null())),
  handler: async (ctx, args) => {
    return await Promise.all(
      args.screenshotIds.map((id) => ctx.storage.getUrl(id)),
    )
  },
})

export const insertIssueReport = internalMutation({
  args: {
    userId: v.id('users'),
    recordedUserName: v.optional(v.string()),
    recordedUserEmail: v.optional(v.string()),
    replyEmail: v.string(),
    reportType: reportTypeValidator,
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
  returns: v.id('issue_reports'),
  handler: async (ctx, args) => {
    const recentCount = await countRecentReports(ctx, args.userId)
    if (recentCount >= MAX_ISSUE_REPORTS_PER_DAY) {
      throw new Error('RATE_LIMITED')
    }
    return await ctx.db.insert('issue_reports', {
      ...args,
      status: 'open',
      submittedAt: Date.now(),
      emailSendStatus: 'pending',
    })
  },
})

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }
    return await ctx.storage.generateUploadUrl()
  },
})

// Lets the client show the Discord fallback before the user fills out the form.
export const getDailyQuota = query({
  args: {},
  returns: v.object({
    used: v.number(),
    limit: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx) => {
    const user = await getAuthUser(ctx)
    if (!user) {
      return {
        used: 0,
        limit: MAX_ISSUE_REPORTS_PER_DAY,
        remaining: MAX_ISSUE_REPORTS_PER_DAY,
      }
    }
    const used = await countRecentReports(ctx, user._id)
    return {
      used,
      limit: MAX_ISSUE_REPORTS_PER_DAY,
      remaining: Math.max(0, MAX_ISSUE_REPORTS_PER_DAY - used),
    }
  },
})

export const updateEmailStatus = internalMutation({
  args: {
    reportId: v.id('issue_reports'),
    emailSendStatus: emailSendStatusValidator,
    emailError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      emailSendStatus: args.emailSendStatus,
      emailSentAt: args.emailSendStatus === 'sent' ? Date.now() : undefined,
      emailError: args.emailError,
    })
    return null
  },
})

export const listAll = query({
  args: {
    status: v.optional(issueReportStatusValidator),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user || (user.role !== 'god' && user.role !== 'admin')) {
      throw new Error('Unauthorized: Admin access required')
    }

    const reports =
      args.status !== undefined
        ? await ctx.db
            .query('issue_reports')
            .withIndex('by_status', (q) => q.eq('status', args.status!))
            .collect()
        : await ctx.db.query('issue_reports').collect()

    const reportsWithDetails = await Promise.all(
      reports.map(async (report) => {
        const reportUser = await ctx.db.get(report.userId)
        const project = report.projectId
          ? await ctx.db.get(report.projectId)
          : null
        const screenshotUrls = report.screenshotIds
          ? await Promise.all(
              report.screenshotIds.map((id) => ctx.storage.getUrl(id)),
            )
          : []
        return {
          ...report,
          userName:
            report.recordedUserName ||
            reportUser?.name ||
            reportUser?.email ||
            'Unknown User',
          userEmail: report.recordedUserEmail || reportUser?.email,
          projectName: project?.name || project?.semantic_identifier,
          screenshotUrls: screenshotUrls.filter(
            (url): url is string => typeof url === 'string',
          ),
        }
      }),
    )

    return reportsWithDetails.sort((a, b) => b.submittedAt - a.submittedAt)
  },
})

export const updateStatus = mutation({
  args: {
    reportId: v.id('issue_reports'),
    status: issueReportStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user || (user.role !== 'god' && user.role !== 'admin')) {
      throw new Error('Unauthorized: Admin access required')
    }

    await ctx.db.patch(args.reportId, { status: args.status })
    return null
  },
})
