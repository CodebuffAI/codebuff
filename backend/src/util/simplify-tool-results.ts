import { ToolContent } from 'ai'

/**
 * Simplifies read_files tool results to show only file paths while preserving other tool results.
 * Useful for making tool result output more concise in message history.
 * @param messageContent - The message content containing tool results
 * @returns The message content with simplified read_files results showing only paths
 */
export function simplifyReadFileResults(
  messageContent: ToolContent
): ToolContent {
  const newContent: ToolContent = []
  for (const part of messageContent) {
    if (part.toolName !== 'read_files') {
      newContent.push(part)
      continue
    }
    if (typeof part.result !== 'object' || !Array.isArray(part.result)) {
      newContent.push(part)
    }
    newContent.push({
      ...part,
      result: (part.result as { path: string; content: string }[])
        .map(({ path }) => path)
        .join('\n'),
    })
  }
  return newContent
}

/**
 * Simplifies terminal command tool results to show a brief summary while preserving other tool results.
 * Useful for making tool result output more concise in message history.
 * @param messageContent - The message content containing tool results
 * @returns The message content with simplified terminal command results
 */
export function simplifyTerminalCommandResults(
  messageContent: ToolContent
): ToolContent {
  return messageContent.map((part) =>
    part.toolName === 'run_terminal_command'
      ? {
          ...part,
          result: '[Output omitted]',
        }
      : part
  )
}
