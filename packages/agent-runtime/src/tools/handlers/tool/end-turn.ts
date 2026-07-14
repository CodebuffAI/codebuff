import { listRunningBackgroundJobs } from '@codebuff/common/util/pending-background-jobs'

import { listRunningBackgroundAgentJobs } from '../../../util/background-agent-jobs'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentState } from '@codebuff/common/types/session-state'

const MAX_JOBS_LISTED = 5

export const handleEndTurn = (async (params: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebuffToolCall<'end_turn'>
  agentState?: AgentState
  clientSessionId?: string
}): Promise<{ output: CodebuffToolOutput<'end_turn'> }> => {
  const { previousToolCallFinished, agentState, clientSessionId } = params

  await previousToolCallFinished

  const rootRunId = agentState
    ? agentState.ancestorRunIds[0] ?? agentState.runId ?? agentState.agentId
    : undefined
  const runningJobs =
    clientSessionId && rootRunId
      ? listRunningBackgroundJobs({ clientSessionId, rootRunId })
      : listRunningBackgroundJobs()
  const runningAgentJobs =
    clientSessionId && rootRunId
      ? listRunningBackgroundAgentJobs({ clientSessionId, rootRunId })
      : listRunningBackgroundAgentJobs()
  if (runningJobs.length === 0 && runningAgentJobs.length === 0) {
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
  const listedAgents = runningAgentJobs
    .slice(0, MAX_JOBS_LISTED)
    .map((job) => ({
      jobId: job.jobId,
      agentType: job.agentType,
      agentName: job.agentName,
      startedAt: job.startedAt,
    }))
  const remainingAgents = runningAgentJobs.length - listedAgents.length
  const summary =
    `Turn ended. ${runningJobs.length} shell job(s) and ${runningAgentJobs.length} agent job(s) are still running. ` +
    `Use check_job/read_logs/kill_job or check_background_agent to manage them.`

  return {
    output: [
      {
        type: 'json',
        value: {
          message: summary,
          pendingBackgroundJobs: listed,
          pendingBackgroundAgentJobs: listedAgents,
          ...(remaining > 0
            ? { pendingBackgroundJobsTruncated: remaining }
            : {}),
          ...(remainingAgents > 0
            ? { pendingBackgroundAgentJobsTruncated: remainingAgents }
            : {}),
        },
      },
    ],
  }
}) satisfies CodebuffToolHandlerFunction<'end_turn'>
