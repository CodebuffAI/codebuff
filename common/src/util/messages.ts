import { buildArray } from './array'
import { deepCopy, deepEqual, hasKey } from './object'
import { getToolCallString } from '../tools/utils'

import type {
  AssistantCodebuffMessage,
  CodebuffMessage,
  SystemCodebuffMessage,
  ToolCodebuffMessage,
  UserCodebuffMessage,
} from '../types/messages/codebuff-message'
import type { ModelMessage } from 'ai'

export function toContentString(msg: ModelMessage): string {
  const { content } = msg
  if (typeof content === 'string') return content
  return content.map((item) => (item as any)?.text ?? '').join('\n')
}

export function withCacheControl<T extends CodebuffMessage>(msg: T): T {
  const message = deepCopy(msg)
  if (!message.providerOptions) {
    message.providerOptions = {}
  }
  if (!message.providerOptions.anthropic) {
    message.providerOptions.anthropic = {}
  }
  message.providerOptions.anthropic.cacheControl = { type: 'ephemeral' }
  if (!message.providerOptions.openrouter) {
    message.providerOptions.openrouter = {}
  }
  message.providerOptions.openrouter.cacheControl = { type: 'ephemeral' }
  return message
}

export function withoutCacheControl<T extends CodebuffMessage>(msg: T): T {
  const message = deepCopy(msg)
  if (hasKey(message.providerOptions?.anthropic?.cacheControl, 'type')) {
    delete message.providerOptions?.anthropic?.cacheControl?.type
  }
  if (
    Object.keys(message.providerOptions?.anthropic?.cacheControl ?? {})
      .length === 0
  ) {
    delete message.providerOptions?.anthropic?.cacheControl
  }
  if (Object.keys(message.providerOptions?.anthropic ?? {}).length === 0) {
    delete message.providerOptions?.anthropic
  }

  if (hasKey(message.providerOptions?.openrouter?.cacheControl, 'type')) {
    delete message.providerOptions?.openrouter?.cacheControl?.type
  }
  if (
    Object.keys(message.providerOptions?.openrouter?.cacheControl ?? {})
      .length === 0
  ) {
    delete message.providerOptions?.openrouter?.cacheControl
  }
  if (Object.keys(message.providerOptions?.openrouter ?? {}).length === 0) {
    delete message.providerOptions?.openrouter
  }

  if (Object.keys(message.providerOptions ?? {}).length === 0) {
    delete message.providerOptions
  }

  return message
}

type Nested<P> = Parameters<typeof buildArray<P>>[0]
type NonStringContent<Message extends { content: any }> = Omit<
  Message,
  'content'
> & {
  content: Exclude<Message['content'], string>
}

function userToCodebuffMessage(
  message: Omit<UserCodebuffMessage, 'content'> & {
    content: Exclude<UserCodebuffMessage['content'], string>[number]
  },
): NonStringContent<UserCodebuffMessage> {
  return { ...message, content: [message.content] }
}

function assistantToCodebuffMessage(
  message: Omit<AssistantCodebuffMessage, 'content'> & {
    content: Exclude<AssistantCodebuffMessage['content'], string>[number]
  },
): NonStringContent<AssistantCodebuffMessage> {
  if (message.content.type === 'tool-call') {
    return {
      ...message,
      content: [
        {
          type: 'text',
          text: getToolCallString(
            message.content.toolName,
            message.content.input,
            false,
          ),
        },
      ],
    }
  }
  return { ...message, content: [message.content] }
}

function toolToCodebuffMessage(
  message: Omit<ToolCodebuffMessage, 'content'> & {
    content: Exclude<ToolCodebuffMessage['content'], string>[number]
  },
): Nested<
  | NonStringContent<UserCodebuffMessage>
  | NonStringContent<AssistantCodebuffMessage>
> {
  return message.content.output.value.map((o) => {
    if (o.type === 'json') {
      const toolResult = {
        tool_name: message.content.toolName,
        id: message.content.toolCallId,
        output: o.value,
      }
      return {
        ...message,
        role: 'user',
        content: [
          {
            type: 'text',
            text: `<tool_result>\n${JSON.stringify(toolResult, null, 2)}\n</tool_result>`,
          },
        ],
      } satisfies NonStringContent<UserCodebuffMessage>
    }
    if (o.type === 'media') {
      return {
        ...message,
        role: 'user',
        content: [{ type: 'file', data: o.data, mediaType: o.mediaType }],
      } satisfies NonStringContent<UserCodebuffMessage>
    }
    o satisfies never
    const oAny = o as any
    throw new Error(`Invalid tool output type: ${oAny.type}`)
  })
}

function convertToolMessages(
  message: CodebuffMessage,
): Nested<
  | SystemCodebuffMessage
  | NonStringContent<UserCodebuffMessage>
  | NonStringContent<AssistantCodebuffMessage>
> {
  if (message.role === 'system') {
    return message
  }
  if (message.role === 'user') {
    if (typeof message.content === 'string') {
      return {
        ...message,
        content: [{ type: 'text' as const, text: message.content }],
      }
    }
    return message.content.map((c) => {
      return userToCodebuffMessage({
        ...message,
        content: c,
      })
    })
  }
  if (message.role === 'assistant') {
    if (typeof message.content === 'string') {
      return {
        ...message,
        content: [{ type: 'text' as const, text: message.content }],
      }
    }
    return message.content.map((c) => {
      return assistantToCodebuffMessage({
        ...message,
        content: c,
      })
    })
  }
  if (message.role !== 'tool') {
    message satisfies never
    const messageAny = message as any
    throw new Error(`Invalid message role: ${messageAny.role}`)
  }
  return message.content.map((c) => {
    return toolToCodebuffMessage({
      ...message,
      content: c,
    })
  })
}

export function convertCbToModelMessages({
  messages,
  includeCacheControl = true,
}: {
  messages: CodebuffMessage[]
  includeCacheControl?: boolean
}): ModelMessage[] {
  const noToolMessages = buildArray(
    messages.map((m) => convertToolMessages(withoutCacheControl(m))),
  )

  const aggregated: typeof noToolMessages = []
  for (const message of noToolMessages) {
    if (aggregated.length === 0) {
      aggregated.push(message)
      continue
    }

    const lastMessage = aggregated[aggregated.length - 1]
    if (
      lastMessage.keepDuringTruncation !== message.keepDuringTruncation &&
      lastMessage.timeToLive !== message.timeToLive &&
      !deepEqual(lastMessage.providerOptions, message.providerOptions)
    ) {
      aggregated.push(message)
      continue
    }
    if (lastMessage.role === 'system' && message.role === 'system') {
      lastMessage.content += '\n\n' + message.content
      continue
    }
    if (lastMessage.role === 'user' && message.role === 'user') {
      lastMessage.content.push(...message.content)
      continue
    }
    if (lastMessage.role === 'assistant' && message.role === 'assistant') {
      lastMessage.content.push(...message.content)
      continue
    }

    aggregated.push(message)
  }

  if (!includeCacheControl) {
    return aggregated
  }

  // add cache control to specific messages
  for (const ttl of ['agentStep', 'userPrompt'] as const) {
    const index = aggregated.findIndex((m) => m.timeToLive === ttl)
    if (index <= 0) {
      continue
    }
    aggregated[index - 1] = withCacheControl(aggregated[index - 1])
  }
  aggregated[aggregated.length - 1] = withCacheControl(
    aggregated[aggregated.length - 1],
  )

  return aggregated
}
