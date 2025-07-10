import {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolHandlerFunction,
} from '../constants'

export const handleRunTerminalCommand = (async (params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'run_terminal_command'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'run_terminal_command'>
  ) => Promise<string>
}): Promise<{ result: string; state: {} }> => {
  const { previousToolCallResult, toolCall, requestClientToolCall } = params

  await previousToolCallResult
  const clientToolCall: ClientToolCall<'run_terminal_command'> = {
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
  return { result: await requestClientToolCall(clientToolCall), state: {} }
}) satisfies CodebuffToolHandlerFunction<'run_terminal_command'>
