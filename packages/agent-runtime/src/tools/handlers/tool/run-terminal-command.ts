import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentState } from '@codebuff/common/types/session-state'

type ToolName = 'run_terminal_command'
export const handleRunTerminalCommand = (async ({
  previousToolCallFinished,
  toolCall,
  agentTemplate,
  spawnParams,
  agentState,
  clientSessionId,
  requestClientToolCall,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  agentTemplate: AgentTemplate
  spawnParams?: Record<string, unknown>
  agentState: AgentState
  clientSessionId: string
  requestClientToolCall: (
    toolCall: ClientToolCall<ToolName>,
  ) => Promise<CodebuffToolOutput<ToolName>>
}): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const clientToolCall: ClientToolCall<ToolName> = {
    toolName: 'run_terminal_command',
    toolCallId: toolCall.toolCallId,
    input: {
      command: toolCall.input.command,
      mode: 'assistant',
      permission_profile:
        agentTemplate.terminalPermissionProfile ?? 'workspace-write',
      allowed_paths: Array.isArray(spawnParams?.owned_paths)
        ? spawnParams.owned_paths.filter(
            (value): value is string => typeof value === 'string',
          )
        : undefined,
      process_type: toolCall.input.process_type,
      detach: toolCall.input.detach,
      timeout_seconds: toolCall.input.timeout_seconds,
      cwd: toolCall.input.cwd,
      owner: {
        clientSessionId,
        rootRunId:
          agentState.ancestorRunIds[0] ??
          agentState.runId ??
          agentState.agentId,
        parentRunId: agentState.runId ?? agentState.agentId,
        parentAgentId: agentState.agentId,
      },
    },
  }
  await previousToolCallFinished
  return { output: await requestClientToolCall(clientToolCall) }
}) satisfies CodebuffToolHandlerFunction<ToolName>
