import {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolHandlerFunction,
} from '../constants'

export const handleRunTerminalCommand = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'run_terminal_command'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'run_terminal_command'>
  ) => Promise<string>
}): { result: Promise<string>; state: {} } => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  const clientToolCall: ClientToolCall<'run_terminal_command'> = {
    type: 'tool-call',
    toolName: 'run_terminal_command',
    toolCallId: toolCall.toolCallId,
    args: {
      command: toolCall.args.command,
      mode: 'assistant',
      process_type: toolCall.args.process_type,
      timeout_seconds: toolCall.args.timeout_seconds,
      cwd: toolCall.args.cwd,
    },
  }
  return {
    result: previousToolCallFinished.then(() =>
      requestClientToolCall(clientToolCall)
    ),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'run_terminal_command'>
