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

type ToolName = 'check_job'
export const handleCheckJob = (async ({
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
  const owner = {
    clientSessionId,
    rootRunId:
      agentState.ancestorRunIds[0] ?? agentState.runId ?? agentState.agentId,
  }
  const job = getPendingBackgroundJob(toolCall.input.jobId)
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
    toolName: 'check_job',
    toolCallId: toolCall.toolCallId,
    input: {
      jobId: toolCall.input.jobId,
      wait_for: toolCall.input.wait_for,
      timeout_seconds: toolCall.input.timeout_seconds,
      kill_on_timeout: toolCall.input.kill_on_timeout,
    },
  }
  await previousToolCallFinished
  return { output: await requestClientToolCall(clientToolCall) }
}) satisfies CodebuffToolHandlerFunction<ToolName>
