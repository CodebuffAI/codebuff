import { cloneDeep, has, isEqual } from 'lodash'

import { buildArray } from './array'
import { getToolCallString } from '../tools/utils'

import type {
  AssistantCodebuffMessage,
  CodebuffMessage,
  SystemCodebuffMessage,
  ToolCodebuffMessage,
  UserCodebuffMessage,
} from '../types/messages/codebuff-message'
import type { ProviderMetadata } from '../types/messages/provider-metadata'
import type { ModelMessage } from 'ai'

export function toContentString(msg: ModelMessage): string {
  const { content } = msg
  if (typeof content === 'string') return content
  return content.map((item) => (item as any)?.text ?? '').join('\n')
}

export function withCacheControl<
  T extends { providerOptions?: ProviderMetadata },
>(obj: T): T {
  const wrapper = cloneDeep(obj)
  if (!wrapper.providerOptions) {
    wrapper.providerOptions = {}
  }
  if (!wrapper.providerOptions.anthropic) {
    wrapper.providerOptions.anthropic = {}
  }
  wrapper.providerOptions.anthropic.cacheControl = { type: 'ephemeral' }
  if (!wrapper.providerOptions.openrouter) {
    wrapper.providerOptions.openrouter = {}
  }
  wrapper.providerOptions.openrouter.cacheControl = { type: 'ephemeral' }
  return wrapper
}

export function withoutCacheControl<
  T extends { providerOptions?: ProviderMetadata },
>(obj: T): T {
  const wrapper = cloneDeep(obj)
  if (has(wrapper.providerOptions?.anthropic?.cacheControl, 'type')) {
    delete wrapper.providerOptions?.anthropic?.cacheControl?.type
  }
  if (
    Object.keys(wrapper.providerOptions?.anthropic?.cacheControl ?? {})
      .length === 0
  ) {
    delete wrapper.providerOptions?.anthropic?.cacheControl
  }
  if (Object.keys(wrapper.providerOptions?.anthropic ?? {}).length === 0) {
    delete wrapper.providerOptions?.anthropic
  }

  if (has(wrapper.providerOptions?.openrouter?.cacheControl, 'type')) {
    delete wrapper.providerOptions?.openrouter?.cacheControl?.type
  }
  if (
    Object.keys(wrapper.providerOptions?.openrouter?.cacheControl ?? {})
      .length === 0
  ) {
    delete wrapper.providerOptions?.openrouter?.cacheControl
  }
  if (Object.keys(wrapper.providerOptions?.openrouter ?? {}).length === 0) {
    delete wrapper.providerOptions?.openrouter
  }

  if (Object.keys(wrapper.providerOptions ?? {}).length === 0) {
    delete wrapper.providerOptions
  }

  return wrapper
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
  const noToolMessages = buildArray(messages.map((m) => convertToolMessages(m)))

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
      !isEqual(lastMessage.providerOptions, message.providerOptions)
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
    const prevMessage = aggregated[index - 1]
    const contentBlock = prevMessage.content
    if (typeof contentBlock === 'string') {
      aggregated[index - 1] = withCacheControl(aggregated[index - 1])
      continue
    }
    contentBlock[contentBlock.length - 1] = withCacheControl(
      contentBlock[contentBlock.length - 1],
    )
  }

  const lastMessage = aggregated[aggregated.length - 1]
  const contentBlock = lastMessage.content
  if (typeof contentBlock === 'string') {
    aggregated[aggregated.length - 1] = withCacheControl(
      aggregated[aggregated.length - 1],
    )
    return aggregated
  }
  contentBlock[contentBlock.length - 1] = withCacheControl(
    contentBlock[contentBlock.length - 1],
  )

  return aggregated
}
