import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import {
  getPendingBackgroundJob,
  pendingBackgroundJobOwnedBy,
} from '@codebuff/common/util/pending-background-jobs'
import type { AgentState } from '@codebuff/common/types/session-state'

type ToolName = 'kill_job'
export const handleKillJob = (async ({
  previousToolCallFinished,
  toolCall,
  requestClientToolCall,
  agentState,
  clientSessionId,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  requestClientToolCall: (
    toolCall: ClientToolCall<ToolName>,
  ) => Promise<CodebuffToolOutput<ToolName>>
  agentState: AgentState
  clientSessionId: string
}): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const job = getPendingBackgroundJob(toolCall.input.jobId)
  const owner = {
    clientSessionId,
    rootRunId:
      agentState.ancestorRunIds[0] ?? agentState.runId ?? agentState.agentId,
  }
  if (!job || !pendingBackgroundJobOwnedBy(job, owner)) {
    return {
      output: [
        {
          type: 'json',
          value: {
            jobId: toolCall.input.jobId,
            errorMessage: `Background shell job "${toolCall.input.jobId}" is unavailable to this run.`,
          },
        },
      ],
    }
  }
  const clientToolCall: ClientToolCall<ToolName> = {
    toolName: 'kill_job',
    toolCallId: toolCall.toolCallId,
    input: {
      jobId: toolCall.input.jobId,
      signal: toolCall.input.signal,
    },
  }
  await previousToolCallFinished
  return { output: await requestClientToolCall(clientToolCall) }
}) satisfies CodebuffToolHandlerFunction<ToolName>
