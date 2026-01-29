import { formatTimestamp } from './helpers'

import type { PendingBashMessage } from '../types/store'
import type { ChatMessage, ContentBlock } from '../types/chat'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'

export function createRunTerminalToolResult(params: {
  command: string
  cwd: string
  stdout: string | null
  stderr: string | null
  exitCode: number
  errorMessage?: string
}): ToolResultOutput[] {
  const { command, cwd, stdout, stderr, exitCode, errorMessage } = params
  if (errorMessage) {
    return [
      {
        type: 'json' as const,
        value: { command, startingCwd: cwd, errorMessage },
      },
    ]
  }
  return [
    {
      type: 'json' as const,
      value: {
        command,
        startingCwd: cwd,
        stdout: stdout || null,
        stderr: stderr || null,
        exitCode,
      },
    },
  ]
}

export function buildBashHistoryMessages(params: {
  command: string
  cwd: string
  toolCallId?: string
  output?: string
  isComplete?: boolean
}): {
  assistantMessage: ChatMessage
  toolCallId: string
} {
  const { command, cwd, output = '...', isComplete = false } = params
  const toolCallId = params.toolCallId ?? crypto.randomUUID()

  const toolBlock: ContentBlock = {
    type: 'tool',
    toolName: 'run_terminal_command',
    toolCallId,
    input: { command },
    output,
  }

  const assistantMessage: ChatMessage = {
    id: `bash-result-${toolCallId}`,
    variant: 'ai',
    content: '',
    blocks: [toolBlock],
    timestamp: formatTimestamp(),
    isComplete,
    metadata: { bashCwd: cwd },
  }

  return { assistantMessage, toolCallId }
}

/**
 * Format pending bash messages as context to prepend to the user's prompt.
 * This provides the LLM with information about commands the user ran manually.
 * Only includes completed (non-running) commands.
 */
export function formatBashContextForPrompt(
  pendingBashMessages: PendingBashMessage[],
): string {
  // Only include completed commands
  const completedCommands = pendingBashMessages.filter((msg) => !msg.isRunning)
  
  if (completedCommands.length === 0) {
    return ''
  }

  const commandsContext = completedCommands
    .map((bash) => {
      const cwd = bash.cwd || process.cwd()
      let result = `Command: ${bash.command}\nDirectory: ${cwd}\nExit code: ${bash.exitCode}`
      if (bash.stdout) {
        result += `\nStdout:\n${bash.stdout}`
      }
      if (bash.stderr) {
        result += `\nStderr:\n${bash.stderr}`
      }
      return result
    })
    .join('\n\n---\n\n')

  return `<user_terminal_commands>
The user ran the following terminal command(s) before this message:

${commandsContext}
</user_terminal_commands>

`
}
