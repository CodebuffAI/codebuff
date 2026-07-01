import { v } from 'convex/values'
import {
  internalMutation,
  internalQuery,
  query,
} from '../_generated/server'
import { internal } from '../_generated/api'
import { getAuthUser } from '../users'
import { startFreebuffRunCore } from '../coding_agent/cli_agent/trigger'
import { runResolvedGates } from '../coding_agent/shared/triggerGates'
import type { Doc, Id } from '../_generated/dataModel'

// Automated bug-fixer pipeline, stage 2 of 2 (stage 1 is ./triage.ts):
// approved issue reports sit in `bug_fixer_queue` and are dispatched — one at
// a time, oldest first — as Codex runs inside the configured Freebuff Cloud
// project's sandbox. One-at-a-time matters: every run shares that sandbox's
// worktree, and each run is told to branch fresh off main, so overlapping
// runs would fight over git state.
//
// Progress is visible to admins at /cloud/project/<semantic id>; the PR
// itself is created by the agent (instructed in the dispatch prompt).

const MAX_QUEUE_LIST = 100

// Global (all-accounts) anti-flood limits over a rolling 24h window. These
// backstop the per-user 2-reports/day cap on issue_reports: they stop a
// spammer from spreading submissions across many accounts to overwhelm triage
// (LLM cost) or the Codex dispatch pipeline (compute + PR noise).
const ANTI_FLOOD_WINDOW_MS = 24 * 60 * 60 * 1000
// Reports admitted into the pipeline (a triage row created) per day. Capping
// intake also caps the number of triage LLM calls.
export const MAX_PIPELINE_INTAKE_PER_DAY = 100
// Reports actually dispatched to Codex as PR runs per day.
export const MAX_CODEX_DISPATCHES_PER_DAY = 50

export const issueReportLabel = (reportType: string | undefined) =>
  reportType === 'feature_request' ? 'Feature request' : 'Bug report'

export const getReportForTriage = internalQuery({
  args: { reportId: v.id('issue_reports') },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId)
    if (!report) return null

    const screenshotUrls = report.screenshotIds
      ? (
          await Promise.all(
            report.screenshotIds.map((id) => ctx.storage.getUrl(id)),
          )
        ).filter((url): url is string => typeof url === 'string')
      : []

    return { report, screenshotUrls }
  },
})

/**
 * Open a pipeline row for a fresh report (status "triaging") and return the
 * dedupe ledger: summaries of everything already approved for firing. Skips
 * reports that already have a row (idempotent against double-scheduling).
 */
export const beginTriage = internalMutation({
  args: {
    reportId: v.id('issue_reports'),
    targetProjectSemanticId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    queueItemId: Id<'bug_fixer_queue'>
    priorItems: Array<{ summary: string; status: string }>
  } | null> => {
    const existing = await ctx.db
      .query('bug_fixer_queue')
      .withIndex('by_report', (q) => q.eq('report_id', args.reportId))
      .first()
    if (existing) return null

    // Anti-flood intake cap: refuse to admit more than N reports into the
    // pipeline per rolling 24h across all accounts. Counting by _creationTime
    // (never rewritten) and stopping before the insert also prevents the
    // triage LLM call for anything over the cap. Bounded read: once the cap
    // holds, at most ~N rows fall in the window; the margin covers races.
    const intakeCutoff = Date.now() - ANTI_FLOOD_WINDOW_MS
    const recentIntake = await ctx.db
      .query('bug_fixer_queue')
      .order('desc')
      .take(MAX_PIPELINE_INTAKE_PER_DAY + 25)
    const intakeCount = recentIntake.filter(
      (row) => row._creationTime >= intakeCutoff,
    ).length
    if (intakeCount >= MAX_PIPELINE_INTAKE_PER_DAY) {
      console.warn(
        `[BugFixer] Daily intake cap reached (${intakeCount}/${MAX_PIPELINE_INTAKE_PER_DAY}); skipping report ${args.reportId}`,
      )
      return null
    }

    const report = await ctx.db.get(args.reportId)
    if (!report) return null

    const queueItemId = await ctx.db.insert('bug_fixer_queue', {
      report_id: args.reportId,
      user_id: report.userId,
      status: 'triaging',
      target_project_semantic_id: args.targetProjectSemanticId,
      enqueued_at: Date.now(),
    })

    // Dedupe against everything already approved for firing (queued, running,
    // or done). Deliberately excludes rejected rows so a report that was
    // rejected for vagueness doesn't block a better-written resubmission.
    // Bounded read: scan only the most recent rows (newest first) rather than
    // the whole table, so this stays cheap as the pipeline history grows.
    const recent = await ctx.db.query('bug_fixer_queue').order('desc').take(300)
    const priorItems = recent
      .filter(
        (item) =>
          item._id !== queueItemId &&
          item.status !== 'triaging' &&
          item.status !== 'rejected' &&
          item.triage_summary,
      )
      .slice(0, 60)
      .map((item) => ({
        summary: item.triage_summary!,
        status: item.status,
      }))

    return { queueItemId, priorItems }
  },
})

export const recordTriageVerdict = internalMutation({
  args: {
    queueItemId: v.id('bug_fixer_queue'),
    approved: v.boolean(),
    reason: v.string(),
    summary: v.string(),
    // Set only when triage itself broke (model threw / unparseable output), so
    // the admin panel can distinguish "the model decided to reject" from "the
    // triage step errored" — both otherwise land on status 'rejected'.
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.queueItemId)
    if (!item || item.status !== 'triaging') return null

    await ctx.db.patch(args.queueItemId, {
      status: args.approved ? 'queued' : 'rejected',
      triage_reason: args.reason,
      triage_summary: args.summary,
      ...(args.error ? { error: args.error } : {}),
      ...(args.approved ? { enqueued_at: Date.now() } : {}),
    })
    return null
  },
})

function buildDispatchPrompt(params: {
  report: Doc<'issue_reports'>
  triageSummary?: string
  threadContext: Array<{ role: string; content: string; date?: number }>
}): string {
  const { report, triageSummary, threadContext } = params
  const label = issueReportLabel(report.reportType)
  const scaleLabel =
    report.reportType === 'feature_request' ? 'Urgency' : 'Severity'

  const contextLines = [
    `Type: ${label}`,
    `${scaleLabel}: ${report.severity}/10`,
    report.category ? `Category: ${report.category}` : null,
    `Source surface: ${report.source}`,
    report.projectSemanticIdentifier
      ? `Reporting user's project semantic id (use it to reproduce/debug their situation): ${report.projectSemanticIdentifier}`
      : null,
    report.pageUrl ? `Page URL where it happened: ${report.pageUrl}` : null,
    report.userAgent ? `User agent: ${report.userAgent}` : null,
    `Submitted at: ${new Date(report.submittedAt).toISOString()}`,
    triageSummary ? `Triage summary: ${triageSummary}` : null,
  ].filter((line): line is string => line !== null)

  const detailSections = [
    '',
    report.reportType === 'feature_request'
      ? '## Feature request'
      : '## What is the bug?',
    report.issue,
    ...(report.reproductionSteps
      ? ['', '## How to reproduce', report.reproductionSteps]
      : []),
    ...(report.additionalLogs
      ? ['', '## Additional logs / context', report.additionalLogs]
      : []),
    ...(report.screenshotIds && report.screenshotIds.length > 0
      ? [
          '',
          `The user's screenshot${report.screenshotIds.length > 1 ? 's are' : ' is'} attached to this message — inspect ${report.screenshotIds.length > 1 ? 'them' : 'it'} carefully.`,
        ]
      : []),
  ]

  const threadLines =
    threadContext.length > 0
      ? [
          '',
          "## Recent messages from the reporter's agent thread",
          ...threadContext.map((message) => {
            const timestamp = message.date
              ? new Date(message.date).toISOString()
              : 'unknown time'
            return `[${message.role} @ ${timestamp}]\n${message.content}`
          }),
        ]
      : []

  return [
    `You are the automated Freebuff bug-fixer bot. A user ${label.toLowerCase()} passed AI triage and you must now implement the fix in this repository (the Freebuff production codebase) and open a pull request.`,
    '',
    '# User report (full context)',
    ...contextLines,
    ...detailSections,
    ...threadLines,
    '',
    '# Requirements — follow these exactly',
    '1. You MUST start by creating a new branch off the most recent `main`: fetch/pull the latest main first, then branch from it. Never commit to main directly and never reuse a branch from a previous run.',
    '2. Work in one go, without asking any questions or waiting for input, until completion — complete the work fully and without mistakes.',
    "3. Your goal is to take the new branch from fresh main and implement the user's bug fix or feature request.",
    "4. First evaluate and plan the fix: figure out how to implement it. Look through the git history and recent pushes to understand context — recent changes may have caused the issue. If the request is not possible for you, is outside what this codebase controls, or there is not enough information to implement it, stop and terminate without opening a PR (say why).",
    '5. If you have enough information, execute the fix and check over your work (build, typecheck, and test whatever the change touches).',
    '6. Once you judge it good enough for production, create a pull request. The PR description must explain: what the user requested, what you implemented, and your confidence that it is ready to merge.',
  ].join('\n')
}

/**
 * The queue pump — cron target (every minute) and kicked after triage
 * approvals. Finishes any completed running item, then dispatches the oldest
 * queued item into the configured target project as a fresh-thread Codex run
 * (using the project owner's saved Codex OAuth credentials). Never throws.
 */
export const processQueue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    try {
      const config = await ctx.db.query('bug_fixer_config').first()
      if (!config || !config.enabled) return null

      // Settle running items: a run is done once its thread stops processing.
      // Read the final agent message to distinguish a clean finish from an
      // error / timeout (Paused) / cancel, so the admin log is accurate about
      // whether the run actually succeeded.
      const running = await ctx.db
        .query('bug_fixer_queue')
        .withIndex('by_status', (q) => q.eq('status', 'running'))
        .collect()
      let busy = false
      for (const item of running) {
        const threadId = item.thread_id
        const thread = threadId ? await ctx.db.get(threadId) : null
        if (!threadId || !thread) {
          await ctx.db.patch(item._id, {
            status: 'failed',
            finished_at: Date.now(),
            error: 'Agent thread missing',
            failure_kind: 'dispatch_error',
          })
          continue
        }
        if (thread.isProcessing) {
          busy = true
          continue
        }

        const lastMessage = await ctx.db
          .query('agent_message')
          .withIndex('by_thread_active', (q) =>
            q
              .eq('thread_id', threadId)
              .eq('isStreaming', false)
              .eq('deactivated', false),
          )
          .order('desc')
          .first()
        const finalState = lastMessage?.state
        if (finalState === 'Paused') {
          // The watchdog cron (enforceProcessingDeadlines) force-finishes any
          // run still going at the 20-minute cloud turn budget
          // (CLOUD_TURN_BUDGET_MS) by setting state=Paused. That is not a
          // crash — the agent may have been mid-fix — but it never reached a
          // PR, so it counts as failed here; the run simply gets no more time
          // and the queue moves on to the next report.
          await ctx.db.patch(item._id, {
            status: 'failed',
            finished_at: Date.now(),
            error:
              lastMessage?.state_message ||
              'Hit the 20-minute cloud turn time limit before finishing',
            failure_kind: 'timed_out',
          })
        } else if (finalState === 'Error' || finalState === 'Cancelled') {
          await ctx.db.patch(item._id, {
            status: 'failed',
            finished_at: Date.now(),
            error:
              lastMessage?.state_message ||
              `Run ended without completing (state: ${finalState})`,
            failure_kind:
              finalState === 'Cancelled' ? 'cancelled' : 'agent_error',
          })
        } else {
          await ctx.db.patch(item._id, {
            status: 'completed',
            finished_at: Date.now(),
          })
        }
      }
      if (busy) return null

      // Anti-flood dispatch cap: at most N Codex runs started per rolling 24h
      // across all accounts. Counted via the started_at range index (only
      // actually-dispatched rows have started_at). Over the cap we leave items
      // queued; the cron retries and they dispatch once the window clears.
      const dispatchCutoff = Date.now() - ANTI_FLOOD_WINDOW_MS
      const recentDispatches = await ctx.db
        .query('bug_fixer_queue')
        .withIndex('by_started_at', (q) => q.gte('started_at', dispatchCutoff))
        .collect()
      if (recentDispatches.length >= MAX_CODEX_DISPATCHES_PER_DAY) {
        console.warn(
          `[BugFixer] Daily Codex dispatch cap reached (${recentDispatches.length}/${MAX_CODEX_DISPATCHES_PER_DAY}); holding queue`,
        )
        return null
      }

      const next = await ctx.db
        .query('bug_fixer_queue')
        .withIndex('by_status', (q) => q.eq('status', 'queued'))
        .order('asc')
        .first()
      if (!next) return null

      const failItem = async (error: string) => {
        await ctx.db.patch(next._id, {
          status: 'failed',
          finished_at: Date.now(),
          error,
          failure_kind: 'dispatch_error',
        })
      }

      // Scope guard: queued work only ever fires into the project it was
      // approved for, and only while that project is still the configured
      // target. Anything else is refused, never redirected.
      if (next.target_project_semantic_id !== config.target_project_semantic_id) {
        await failItem(
          `Queued for project "${next.target_project_semantic_id}" but the configured target is now "${config.target_project_semantic_id}"`,
        )
        return null
      }

      const project = await ctx.db
        .query('project')
        .withIndex('by_semantic_identifier', (q) =>
          q.eq('semantic_identifier', config.target_project_semantic_id),
        )
        .first()
      if (!project || project.deleted) {
        await failItem('Target project not found')
        return null
      }
      if (project.project_type !== 'connected_repo') {
        await failItem('Target project is not a connected-repo Cloud project')
        return null
      }

      // The run executes as the target project's owner: their saved Codex
      // OAuth credentials get restored into the sandbox by the Codex workflow.
      const ownerMembership = await ctx.db
        .query('project_member')
        .withIndex('by_project_and_role', (q) =>
          q.eq('project', project._id).eq('project_role', 'owner'),
        )
        .first()
      const owner = ownerMembership
        ? await ctx.db.get(ownerMembership.user)
        : null
      if (!owner) {
        await failItem('Target project owner not found')
        return null
      }
      if (owner.codex_auth_mode !== 'chatgpt') {
        await failItem(
          'Target project owner has no saved Codex OAuth credentials',
        )
        return null
      }

      const report = await ctx.db.get(next.report_id)
      if (!report) {
        await failItem('Issue report missing')
        return null
      }

      // System dispatch path (no JWT): mirror automations — DB-resolved
      // gates, full tier, and no per-user rate limiting for the bot itself.
      const gates = await runResolvedGates({
        ctx,
        user: owner,
        project,
        agentType: 'Codex',
        referralCount: owner.qualified_referral_count ?? 0,
        accessTier: 'full',
        skipRateLimitCheck: true,
      })
      if (!gates.ok) {
        await failItem(gates.error.message ?? gates.error.kind)
        return null
      }

      const threadContext = await ctx.runQuery(
        internal.issue_reports.getRecentThreadContext,
        {
          source: report.source,
          threadId: report.threadId,
          limit: 6,
        },
      )

      const result = await startFreebuffRunCore({
        ctx,
        user: gates.user,
        project: gates.project,
        message: buildDispatchPrompt({
          report,
          triageSummary: next.triage_summary,
          threadContext,
        }),
        agentType: 'Codex',
        images:
          report.screenshotIds && report.screenshotIds.length > 0
            ? report.screenshotIds
            : undefined,
        // Fresh thread per report: never blocks on (or hijacks) the
        // project's interactive thread.
        forceNewThread: true,
      })
      if (!result.success) {
        await failItem(result.error.message ?? result.error.kind)
        return null
      }

      await ctx.db.patch(next._id, {
        status: 'running',
        thread_id: result.threadId,
        started_at: Date.now(),
      })
      await ctx.db.patch(report._id, { status: 'reviewing' })
      return null
    } catch (error) {
      console.error('[BugFixer] processQueue failed:', error)
      return null
    }
  },
})

// Live anti-flood usage for the admin panel: how much of today's rolling-24h
// intake and Codex-dispatch budgets have been consumed.
export const getDailyLimits = query({
  args: {},
  returns: v.object({
    intakeUsed: v.number(),
    intakeMax: v.number(),
    dispatchUsed: v.number(),
    dispatchMax: v.number(),
  }),
  handler: async (ctx) => {
    const user = await getAuthUser(ctx)
    if (!user || (user.role !== 'god' && user.role !== 'admin')) {
      throw new Error('Unauthorized: Admin access required')
    }

    const cutoff = Date.now() - ANTI_FLOOD_WINDOW_MS
    const recentIntake = await ctx.db
      .query('bug_fixer_queue')
      .order('desc')
      .take(MAX_PIPELINE_INTAKE_PER_DAY + 25)
    const dispatches = await ctx.db
      .query('bug_fixer_queue')
      .withIndex('by_started_at', (q) => q.gte('started_at', cutoff))
      .collect()

    return {
      intakeUsed: recentIntake.filter((row) => row._creationTime >= cutoff)
        .length,
      intakeMax: MAX_PIPELINE_INTAKE_PER_DAY,
      dispatchUsed: dispatches.length,
      dispatchMax: MAX_CODEX_DISPATCHES_PER_DAY,
    }
  },
})

export const listQueue = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx)
    if (!user || (user.role !== 'god' && user.role !== 'admin')) {
      throw new Error('Unauthorized: Admin access required')
    }

    const items = await ctx.db
      .query('bug_fixer_queue')
      .order('desc')
      .take(MAX_QUEUE_LIST)

    return await Promise.all(
      items.map(async (item) => {
        const report = await ctx.db.get(item.report_id)
        const reporter = report ? await ctx.db.get(report.userId) : null
        return {
          _id: item._id,
          status: item.status,
          triageReason: item.triage_reason ?? null,
          triageSummary: item.triage_summary ?? null,
          targetProjectSemanticId: item.target_project_semantic_id,
          enqueuedAt: item.enqueued_at,
          startedAt: item.started_at ?? null,
          finishedAt: item.finished_at ?? null,
          error: item.error ?? null,
          failureKind: item.failure_kind ?? null,
          reportType: report?.reportType ?? 'bug',
          severity: report?.severity ?? null,
          category: report?.category ?? null,
          issue: report?.issue ?? '(report deleted)',
          pageUrl: report?.pageUrl ?? null,
          reporterProjectSemanticId:
            report?.projectSemanticIdentifier ?? null,
          screenshotCount: report?.screenshotIds?.length ?? 0,
          submittedAt: report?.submittedAt ?? null,
          reporterName:
            report?.recordedUserName ||
            reporter?.name ||
            reporter?.email ||
            'Unknown user',
          reporterEmail:
            report?.recordedUserEmail || reporter?.email || null,
        }
      }),
    )
  },
})
