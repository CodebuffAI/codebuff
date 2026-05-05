import type { Message } from '@codebuff/common/types/messages/codebuff-message'

const TOOL_CALL_ID_PREFIX = 'functions'
type ToolCallLike = { toolName: string }

export function formatToolCallId(toolName: string, index: number): string {
  return `${TOOL_CALL_ID_PREFIX}.${toolName}:${index}`
}

export function countToolCallsByName(
  messages: Message[],
  pendingToolCalls: ToolCallLike[] = [],
): Map<string, number> {
  const counts = new Map<string, number>()

  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue
    }

    for (const part of message.content) {
      if (part.type !== 'tool-call') {
        continue
      }

      counts.set(part.toolName, (counts.get(part.toolName) ?? 0) + 1)
    }
  }

  for (const toolCall of pendingToolCalls) {
    counts.set(toolCall.toolName, (counts.get(toolCall.toolName) ?? 0) + 1)
  }

  return counts
}

export function createToolCallIdGenerator(
  messages: Message[],
  pendingToolCalls: ToolCallLike[] = [],
) {
  const counts = countToolCallsByName(messages, pendingToolCalls)

  return (toolName: string): string => {
    const index = counts.get(toolName) ?? 0
    counts.set(toolName, index + 1)
    return formatToolCallId(toolName, index)
  }
}
