import type { ClientToolCall, CodebuffToolCall } from '../../constants'
import type { CodebuffToolHandlerFunction } from '../handler-function-type'

export const handleRunTerminalCommand = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'run_terminal_command'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'run_terminal_command'>,
  ) => Promise<string>
}): { result: Promise<string>; state: {} } => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  const clientToolCall: ClientToolCall<'run_terminal_command'> = {
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
  return {
    result: previousToolCallFinished.then(() =>
      requestClientToolCall(clientToolCall),
    ),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'run_terminal_command'>
