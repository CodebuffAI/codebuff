import { v } from 'convex/values'

import { internalMutation, internalQuery } from '!/_generated/server'

// Statuses that mean the run is finished and must not be transitioned again.
const TERMINAL_RUN_STATUSES = new Set([
  'completed',
  'paused',
  'error',
  'timed_out',
  'cancelled',
])

export const createFreebuffAgentRun = internalMutation({
  args: {
    runId: v.string(),
    userId: v.id('users'),
    projectId: v.id('project'),
    threadId: v.id('agent_thread'),
    messageId: v.id('agent_message'),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    await ctx.db.insert('freebuff_agent_runs', {
      run_id: args.runId,
      user_id: args.userId,
      project_id: args.projectId,
      thread_id: args.threadId,
      message_id: args.messageId,
      status: 'queued',
      queued_at: now,
      last_event_at: now,
    })
  },
})

export const setFreebuffAgentRunWorkId = internalMutation({
  args: {
    runId: v.string(),
    workId: v.string(),
  },
  handler: async (ctx, args) => {
    const runDoc = await ctx.db
      .query('freebuff_agent_runs')
      .withIndex('by_run_id', (q) => q.eq('run_id', args.runId))
      .unique()
    if (!runDoc) return
    await ctx.db.patch(runDoc._id, { work_id: args.workId })
  },
})

export const markFreebuffAgentRunRunning = internalMutation({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const runDoc = await ctx.db
      .query('freebuff_agent_runs')
      .withIndex('by_run_id', (q) => q.eq('run_id', args.runId))
      .unique()
    if (!runDoc || runDoc.status !== 'queued') return
    const now = Date.now()
    await ctx.db.patch(runDoc._id, {
      status: 'running',
      started_at: now,
      last_event_at: now,
    })
  },
})

// Mark a run as cancelled (user terminated the thread). Returns the work_id so
// the caller can best-effort cancel the underlying workpool item. No-op if the
// run is already in a terminal state.
export const cancelFreebuffAgentRunByRunId = internalMutation({
  args: {
    runId: v.string(),
  },
  returns: v.object({ workId: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const runDoc = await ctx.db
      .query('freebuff_agent_runs')
      .withIndex('by_run_id', (q) => q.eq('run_id', args.runId))
      .unique()
    if (!runDoc) return { workId: undefined }
    if (!TERMINAL_RUN_STATUSES.has(runDoc.status)) {
      await ctx.db.patch(runDoc._id, {
        status: 'cancelled',
        completed_at: Date.now(),
        last_event_at: Date.now(),
      })
    }
    return { workId: runDoc.work_id }
  },
})

// Lightweight status read used by the running agent action to cooperatively
// abort itself when the user cancels.
export const getFreebuffAgentRunStatus = internalQuery({
  args: {
    runId: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const runDoc = await ctx.db
      .query('freebuff_agent_runs')
      .withIndex('by_run_id', (q) => q.eq('run_id', args.runId))
      .unique()
    return runDoc?.status ?? null
  },
})
