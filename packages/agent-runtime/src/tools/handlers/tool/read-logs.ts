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

type ToolName = 'read_logs'
export const handleReadLogs = (async ({
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
  if (toolCall.input.jobId) {
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
              path: toolCall.input.path ?? '',
              jobId: toolCall.input.jobId,
              errorMessage: `Background shell job "${toolCall.input.jobId}" is unavailable to this run.`,
            },
          },
        ],
      }
    }
  }
  const clientToolCall: ClientToolCall<ToolName> = {
    toolName: 'read_logs',
    toolCallId: toolCall.toolCallId,
    input: {
      path: toolCall.input.path,
      jobId: toolCall.input.jobId,
      lines: toolCall.input.lines,
      max_chars: toolCall.input.max_chars,
    },
  }
  await previousToolCallFinished
  return { output: await requestClientToolCall(clientToolCall) }
}) satisfies CodebuffToolHandlerFunction<ToolName>
