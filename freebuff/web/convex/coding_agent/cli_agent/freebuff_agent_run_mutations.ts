import { v } from 'convex/values'

import { internalMutation } from '!/_generated/server'

export const createFreebuffAgentRun = internalMutation({
  args: {
    runId: v.string(),
    projectId: v.id('project'),
    threadId: v.id('agent_thread'),
    messageId: v.id('agent_message'),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    await ctx.db.insert('freebuff_agent_runs', {
      run_id: args.runId,
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
