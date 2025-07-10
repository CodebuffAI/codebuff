import { ClientToolCall, CodebuffToolCall } from '../constants'

export async function handleRunTerminalCommand(params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'run_terminal_command'>
  extra: {
    requestClientToolCall: (
      toolCall: ClientToolCall<'run_terminal_command'>
    ) => Promise<string>
  }
}): Promise<string> {
  const { previousToolCallResult, toolCall, extra } = params
  const { requestClientToolCall } = extra

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
  return await requestClientToolCall(clientToolCall)
}
