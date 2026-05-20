import type { ChatCompletionRequestBody } from './types'

export function createRequestAuditRecord(body: unknown) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { invalid_request_shape: true }
  }

  const typedBody = body as Partial<ChatCompletionRequestBody>
  const messages = Array.isArray(typedBody.messages)
    ? typedBody.messages
    : undefined
  const tools = Array.isArray(typedBody.tools) ? typedBody.tools : undefined

  const messageRoleCounts = messages?.reduce<Record<string, number>>(
    (counts, message) => {
      const role =
        typeof message === 'object' && message !== null && 'role' in message
          ? String(message.role)
          : 'unknown'
      counts[role] = (counts[role] ?? 0) + 1
      return counts
    },
    {},
  )

  return {
    model: typeof typedBody.model === 'string' ? typedBody.model : undefined,
    stream:
      typeof typedBody.stream === 'boolean' ? typedBody.stream : undefined,
    temperature:
      typeof typedBody.temperature === 'number'
        ? typedBody.temperature
        : undefined,
    max_tokens:
      typeof typedBody.max_tokens === 'number'
        ? typedBody.max_tokens
        : undefined,
    max_completion_tokens:
      typeof typedBody.max_completion_tokens === 'number'
        ? typedBody.max_completion_tokens
        : undefined,
    top_p: typeof typedBody.top_p === 'number' ? typedBody.top_p : undefined,
    reasoning_effort:
      typeof typedBody.reasoning_effort === 'string'
        ? typedBody.reasoning_effort
        : undefined,
    reasoning_enabled:
      typeof typedBody.reasoning?.enabled === 'boolean'
        ? typedBody.reasoning.enabled
        : undefined,
    reasoning_effort_nested:
      typeof typedBody.reasoning?.effort === 'string'
        ? typedBody.reasoning.effort
        : undefined,
    usage_include:
      typeof typedBody.usage?.include === 'boolean'
        ? typedBody.usage.include
        : undefined,
    codebuff_metadata:
      typeof typedBody.codebuff_metadata === 'object' &&
      typedBody.codebuff_metadata !== null
        ? { ...typedBody.codebuff_metadata }
        : undefined,
    message_count: messages?.length ?? 0,
    message_role_counts: messageRoleCounts,
    messages_omitted: !!messages,
    tool_count: tools?.length ?? 0,
    tool_names: tools
      ?.map((tool) =>
        typeof tool === 'object' && tool !== null
          ? tool.function?.name
          : undefined,
      )
      .filter((name): name is string => typeof name === 'string'),
    tools_omitted: !!tools,
  }
}
