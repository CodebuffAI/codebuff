import { formatTimestamp } from './helpers'

import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import type { ChatMessage, ContentBlock } from '../types/chat'

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
