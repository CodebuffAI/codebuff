import { listRunningBackgroundJobs } from '@codebuff/common/util/pending-background-jobs'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

const MAX_JOBS_LISTED = 5

export const handleEndTurn = (async (params: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebuffToolCall<'end_turn'>
}): Promise<{ output: CodebuffToolOutput<'end_turn'> }> => {
  const { previousToolCallFinished } = params

  await previousToolCallFinished

  const runningJobs = listRunningBackgroundJobs()
  if (runningJobs.length === 0) {
    return { output: [{ type: 'json', value: { message: 'Turn ended.' } }] }
  }

  // Surface still-running background jobs at end of turn so the agent (and the
  // user reading the transcript) can decide to kill_job, check_job, or read_logs
  // them rather than silently leaking work across turns. We do not auto-kill —
  // dev servers and watchers are intentional long-runners — but we do refuse to
  // hide them.
  const listed = runningJobs.slice(0, MAX_JOBS_LISTED).map((job) => ({
    jobId: job.jobId,
    command: job.command,
    startedAt: job.startedAt,
  }))
  const remaining = runningJobs.length - listed.length
  const summary =
    `Turn ended. ${runningJobs.length} background job(s) are still running. ` +
    `Use check_job/read_logs/kill_job to manage them.`

  return {
    output: [
      {
        type: 'json',
        value: {
          message: summary,
          pendingBackgroundJobs: listed,
          ...(remaining > 0 ? { pendingBackgroundJobsTruncated: remaining } : {}),
        },
      },
    ],
  }
}) satisfies CodebuffToolHandlerFunction<'end_turn'>
