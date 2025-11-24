import { validateToolHandler } from '../handler-function-type'

import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'run_terminal_command'
export const handleRunTerminalCommand = validateToolHandler<ToolName>(
  async ({
    previousToolCallFinished,
    toolCall,
    requestClientToolCall,
  }: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>
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
        process_type: toolCall.input.process_type,
        timeout_seconds: toolCall.input.timeout_seconds,
        cwd: toolCall.input.cwd,
      },
    }
    await previousToolCallFinished
    return { output: await requestClientToolCall(clientToolCall) }
  },
)
