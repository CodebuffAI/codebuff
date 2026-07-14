import { sleep } from '@codebuff/common/util/promise'

import {
  getBackgroundAgentJob,
  readBackgroundAgentChunks,
  backgroundAgentJobOwnedBy,
  cancelBackgroundAgentJob,
  type BackgroundAgentChunk,
} from '../../../util/background-agent-jobs'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentState } from '@codebuff/common/types/session-state'

type ToolName = 'check_background_agent'

/**
 * Flatten a chunk's payload into a searchable string for wait_for matching.
 * Payloads are opaque structured events (text, tool_call, tool_result,
 * subagent_*); we join string-coercible fields so a caller can wait for a
 * substring like 'completed' or a tool name.
 */
function chunkToSearchString(chunk: BackgroundAgentChunk): string {
  const { type, payload } = chunk
  if (typeof payload === 'string') {
    return `${type} ${payload}`
  }
  if (payload && typeof payload === 'object') {
    try {
      return `${type} ${JSON.stringify(payload)}`
    } catch {
      return type
    }
  }
  return type
}

export const handleCheckBackgroundAgent = (async ({
  previousToolCallFinished,
  toolCall,
  agentState,
  clientSessionId,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  agentState: AgentState
  clientSessionId: string
}): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  await previousToolCallFinished

  const {
    jobId,
    wait_for,
    timeout_seconds = 0,
    cancel = false,
    cursor,
  } = toolCall.input
  const job = getBackgroundAgentJob(jobId)
  if (!job) {
    return {
      output: {
        type: 'json',
        value: {
          jobId,
          errorMessage: `No background agent job found with id "${jobId}".`,
        },
      } as unknown as CodebuffToolOutput<ToolName>,
    }
  }
  const rootRunId =
    agentState.ancestorRunIds[0] ?? agentState.runId ?? agentState.agentId
  if (!backgroundAgentJobOwnedBy(job, { clientSessionId, rootRunId })) {
    return {
      output: {
        type: 'json',
        value: {
          jobId,
          errorMessage:
            'Background agent job is not owned by this client session/root run.',
        },
      } as unknown as CodebuffToolOutput<ToolName>,
    }
  }
  const consumerId = `${clientSessionId}:${agentState.agentId}`
  const readChunks = () =>
    readBackgroundAgentChunks({ job, consumerId, cursor })

  if (cancel) {
    const cancelResult = cancelBackgroundAgentJob(jobId)
    if ('errorMessage' in cancelResult) {
      return {
        output: {
          type: 'json',
          value: { jobId, errorMessage: cancelResult.errorMessage },
        } as unknown as CodebuffToolOutput<ToolName>,
      }
    }
    const intent = agentState.backgroundAgentJobs?.find(
      (entry) => entry.jobId === jobId,
    )
    if (intent) {
      intent.status = 'cancelled'
      intent.completedAt = Date.now()
      intent.error = 'Cancelled by check_background_agent.'
    }
    const read = readChunks()
    return {
      output: {
        type: 'json',
        value: {
          jobId,
          status: job.status,
          newChunks: read.chunks,
          nextCursor: read.nextCursor,
          cancelled: true,
          droppedChunks: read.droppedChunks,
          error: job.error,
        },
      } as unknown as CodebuffToolOutput<ToolName>,
    }
  }

  // Poll mode: return immediately with whatever new chunks exist.
  if (!wait_for && (!timeout_seconds || timeout_seconds <= 0)) {
    const read = readChunks()
    return {
      output: {
        type: 'json',
        value: {
          jobId,
          status: job.status,
          newChunks: read.chunks,
          nextCursor: read.nextCursor,
          ...(job.status === 'completed' ? { result: job.result } : {}),
          ...(job.status === 'error' ? { error: job.error } : {}),
          ...(job.status === 'cancelled'
            ? { error: job.error, cancelled: true }
            : {}),
          droppedChunks: read.droppedChunks,
        },
      } as unknown as CodebuffToolOutput<ToolName>,
    }
  }

  // Follow mode: poll until wait_for matches OR the job settles OR the deadline.
  // A single buildFollowResult helper constructs the output object so the match
  // decision is unambiguous (early return short-circuits the loop; no reliance
  // on `break` exiting only an inner for-loop while leaving the while-condition
  // to re-evaluate).
  const findMatch = (chunks: BackgroundAgentChunk[]): boolean => {
    if (!wait_for) return false
    for (const chunk of chunks) {
      if (chunkToSearchString(chunk).includes(wait_for)) {
        return true
      }
    }
    return false
  }

  let latestCursor = cursor
  let droppedChunks = 0
  const buildFollowResult = (
    chunks: BackgroundAgentChunk[],
    matched: boolean,
  ): { output: CodebuffToolOutput<ToolName> } => ({
    output: {
      type: 'json',
      value: {
        jobId,
        status: job.status,
        newChunks: chunks,
        nextCursor: latestCursor,
        ...(job.status === 'completed' ? { result: job.result } : {}),
        ...(job.status === 'error' ? { error: job.error } : {}),
        ...(job.status === 'cancelled'
          ? { error: job.error, cancelled: true }
          : {}),
        droppedChunks,
        matched,
        killed: false,
      },
    } as unknown as CodebuffToolOutput<ToolName>,
  })

  const deadline = Date.now() + (timeout_seconds ?? 0) * 1000
  const initialRead = readBackgroundAgentChunks({
    job,
    consumerId,
    cursor: latestCursor,
  })
  let pendingChunks: BackgroundAgentChunk[] = initialRead.chunks
  latestCursor = initialRead.nextCursor
  droppedChunks += initialRead.droppedChunks

  // Check the initial batch for an immediate match (no wait needed).
  if (findMatch(pendingChunks)) {
    return buildFollowResult(pendingChunks, true)
  }

  // Single polling loop. Early-return on match via the helper; otherwise loop
  // until the job settles or the deadline elapses.
  while (job.status === 'running' && Date.now() < deadline) {
    await sleep(200)
    const read = readBackgroundAgentChunks({
      job,
      consumerId,
      cursor: latestCursor,
    })
    pendingChunks = pendingChunks.concat(read.chunks)
    latestCursor = read.nextCursor
    droppedChunks += read.droppedChunks
    if (findMatch(pendingChunks)) {
      return buildFollowResult(pendingChunks, true)
    }
  }

  // Loop exited: either the job settled or the deadline elapsed without a
  // match. Drain any final chunks accumulated since the last read so the
  // caller sees everything produced during the follow window.
  const finalRead = readBackgroundAgentChunks({
    job,
    consumerId,
    cursor: latestCursor,
  })
  pendingChunks = pendingChunks.concat(finalRead.chunks)
  latestCursor = finalRead.nextCursor
  droppedChunks += finalRead.droppedChunks
  return buildFollowResult(pendingChunks, false)
}) satisfies CodebuffToolHandlerFunction<ToolName>
