import { v } from 'convex/values'
import { internalMutation, mutation, query } from './_generated/server'
import { getAuthUser } from './users'

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

// Anti-abuse: cap combined bug reports + feature requests per user per day.
export const MAX_ISSUE_REPORTS_PER_DAY = 2
const ISSUE_REPORT_WINDOW_MS = 24 * 60 * 60 * 1000

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

export const insertIssueReport = internalMutation({
  args: {
    userId: v.id('users'),
    recordedUserName: v.optional(v.string()),
    recordedUserEmail: v.optional(v.string()),
    replyEmail: v.string(),
    reportType: reportTypeValidator,
    severity: v.number(),
    issue: v.string(),
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
        return {
          ...report,
          userName:
            report.recordedUserName ||
            reportUser?.name ||
            reportUser?.email ||
            'Unknown User',
          userEmail: report.recordedUserEmail || reportUser?.email,
          projectName: project?.name || project?.semantic_identifier,
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
