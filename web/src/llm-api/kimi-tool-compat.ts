import type { ChatCompletionRequestBody } from './types'

export function isKimiModel(model: unknown): model is string {
  return typeof model === 'string' && model.startsWith('moonshotai/')
}

function getToolCallNamesById(
  messages: ChatCompletionRequestBody['messages'],
): Map<string, string> {
  const namesById = new Map<string, string>()

  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue
    }
    for (const toolCall of message.tool_calls ?? []) {
      if (toolCall.id && toolCall.function.name) {
        namesById.set(toolCall.id, toolCall.function.name)
      }
    }
  }

  return namesById
}

/**
 * Kimi-compatible providers require two OpenAI-compatible extensions that are
 * not part of the strict Chat Completions schema: ids on tool declarations and
 * names on tool-result messages.
 */
export function addKimiToolCompatibilityFields(
  body: ChatCompletionRequestBody,
): ChatCompletionRequestBody {
  const namesByToolCallId = getToolCallNamesById(body.messages)

  return {
    ...body,
    tools: body.tools?.map((tool, index) => {
      if (tool.type !== 'function' || tool.id) {
        return tool
      }
      return {
        ...tool,
        id: `tool_${index + 1}`,
      }
    }),
    messages: body.messages.map((message) => {
      if (
        message.role !== 'tool' ||
        message.name ||
        typeof message.tool_call_id !== 'string'
      ) {
        return message
      }

      const name = namesByToolCallId.get(message.tool_call_id)
      if (!name) {
        return message
      }

      return {
        ...message,
        name,
      }
    }),
  }
}
