import {
  buildBashHistoryMessages,
  createRunTerminalToolResult,
  formatBashContextForPrompt,
} from './bash-messages'

import type { PendingBashMessage } from '../state/chat-store'
import type { ChatMessage } from '../types/chat'

// Turns pending bash executions into chat history messages and prompt context.
export const processBashContext = (
  pendingBashMessages: PendingBashMessage[],
): {
  bashMessages: ChatMessage[]
  bashContextForPrompt: string
} => {
  const bashContextForPrompt = formatBashContextForPrompt(pendingBashMessages)
  const bashMessages: ChatMessage[] = []

  for (const bash of pendingBashMessages) {
    if (bash.addedToHistory) {
      continue
    }

    const toolCallId = crypto.randomUUID()
    const cwd = bash.cwd || process.cwd()
    const toolResultOutput = createRunTerminalToolResult({
      command: bash.command,
      cwd,
      stdout: bash.stdout || null,
      stderr: bash.stderr || null,
      exitCode: bash.exitCode,
    })
    const outputJson = JSON.stringify(toolResultOutput)
    const { assistantMessage } = buildBashHistoryMessages({
      command: bash.command,
      cwd,
      toolCallId,
      output: outputJson,
      isComplete: true,
    })

    bashMessages.push(assistantMessage)
  }

  return { bashMessages, bashContextForPrompt }
}
