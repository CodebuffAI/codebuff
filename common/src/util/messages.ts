import { cloneDeep, has, isEqual } from 'lodash'

import { buildArray } from './array'
import { getToolCallString } from '../tools/utils'

import type {
  AssistantMessage,
  Message,
  SystemMessage,
  ToolMessage,
  UserMessage,
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

  /* 'codebuff' provider name is not compatible with providerMetadata for
   * messages, so we need to use 'openaiCompatible' instead.
   * https://github.com/vercel/ai/blob/8e4fdac31b4f8c6a8d07a606a8833e74adf99470/packages/openai-compatible/src/chat/convert-to-openai-compatible-chat-messages.ts#L9
   */
  for (const provider of [
    'anthropic',
    'openrouter',
    'openaiCompatible',
  ] as const) {
    if (!wrapper.providerOptions[provider]) {
      wrapper.providerOptions[provider] = {}
    }
    wrapper.providerOptions[provider].cache_control = { type: 'ephemeral' }
  }

  return wrapper
}

export function withoutCacheControl<
  T extends { providerOptions?: ProviderMetadata },
>(obj: T): T {
  const wrapper = cloneDeep(obj)

  for (const provider of [
    'anthropic',
    'openrouter',
    'openaiCompatible',
  ] as const) {
    if (has(wrapper.providerOptions?.[provider]?.cache_control, 'type')) {
      delete wrapper.providerOptions?.[provider]?.cache_control?.type
    }
    if (
      Object.keys(wrapper.providerOptions?.[provider]?.cache_control ?? {})
        .length === 0
    ) {
      delete wrapper.providerOptions?.[provider]?.cache_control
    }
    if (Object.keys(wrapper.providerOptions?.[provider] ?? {}).length === 0) {
      delete wrapper.providerOptions?.[provider]
    }
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
  message: Omit<UserMessage, 'content'> & {
    content: Exclude<UserMessage['content'], string>[number]
  },
): NonStringContent<UserMessage> {
  return cloneDeep({ ...message, content: [message.content] })
}

function assistantToCodebuffMessage(
  message: Omit<AssistantMessage, 'content'> & {
    content: Exclude<AssistantMessage['content'], string>[number]
  },
): NonStringContent<AssistantMessage> {
  if (message.content.type === 'tool-call') {
    return cloneDeep({
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
    })
  }
  return cloneDeep({ ...message, content: [message.content] })
}

function toolToCodebuffMessage(
  message: ToolMessage,
): Nested<NonStringContent<UserMessage> | NonStringContent<AssistantMessage>> {
  return message.content.output.map((o) => {
    if (o.type === 'json') {
      const toolResult = {
        toolName: message.content.toolName,
        toolCallId: message.content.toolCallId,
        output: o.value,
      }
      return cloneDeep({
        ...message,
        role: 'user',
        content: [
          {
            type: 'text',
            text: `<tool_result>\n${JSON.stringify(toolResult, null, 2)}\n</tool_result>`,
          },
        ],
      } satisfies NonStringContent<UserMessage>)
    }
    if (o.type === 'media') {
      return cloneDeep({
        ...message,
        role: 'user',
        content: [{ type: 'file', data: o.data, mediaType: o.mediaType }],
      } satisfies NonStringContent<UserMessage>)
    }
    o satisfies never
    const oAny = o as any
    throw new Error(`Invalid tool output type: ${oAny.type}`)
  })
}

function convertToolMessages(
  message: Message,
): Nested<
  | SystemMessage
  | NonStringContent<UserMessage>
  | NonStringContent<AssistantMessage>
> {
  if (message.role === 'system') {
    return cloneDeep(message)
  }
  if (message.role === 'user') {
    if (typeof message.content === 'string') {
      return cloneDeep({
        ...message,
        content: [{ type: 'text' as const, text: message.content }],
      })
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
      return cloneDeep({
        ...message,
        content: [{ type: 'text' as const, text: message.content }],
      })
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
  return toolToCodebuffMessage(message)
}

export function convertCbToModelMessages({
  messages,
  includeCacheControl = true,
}: {
  messages: Message[]
  includeCacheControl?: boolean
}): ModelMessage[] {
  const noToolMessages: (
    | SystemMessage
    | NonStringContent<UserMessage>
    | NonStringContent<AssistantMessage>
  )[] = buildArray(messages.map((m) => convertToolMessages(m)))

  const aggregated: typeof noToolMessages = []
  for (const message of noToolMessages) {
    if (aggregated.length === 0) {
      aggregated.push(message)
      continue
    }

    const lastMessage = aggregated[aggregated.length - 1]
    if (
      lastMessage.timeToLive !== message.timeToLive ||
      !isEqual(lastMessage.providerOptions, message.providerOptions) ||
      !isEqual(lastMessage.tags, message.tags)
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

  // Add cache control to specific messages (max of 4 can be marked for caching!):
  // - The message right before the three tagged messages
  // - Last message
  for (const tag of [
    'LAST_ASSISTANT_MESSAGE',
    'USER_PROMPT',
    'STEP_PROMPT',
    undefined, // Last message
  ] as const) {
    let index =
      tag === 'LAST_ASSISTANT_MESSAGE'
        ? aggregated.findLastIndex((m) => m.role === 'assistant')
        : tag
          ? aggregated.findLastIndex((m) => m.tags?.includes(tag))
          : aggregated.length
    if (index <= 0) {
      continue
    }

    // Iterate to find the last "valid" message that we can cache control
    let prevMessage: (typeof aggregated)[number]
    let contentBlock: (typeof prevMessage)['content']
    addCacheControlLoop: while (true) {
      index--

      // No message found
      if (index < 0) {
        break
      }

      prevMessage = aggregated[index]
      contentBlock = prevMessage.content

      if (typeof contentBlock === 'string') {
        // This must be a system message
        aggregated[index] = withCacheControl(aggregated[index])
        break
      }

      // Iterate to find the last valid content part (not a very short string)
      let lastContentIndex = contentBlock.length
      let lastContentPart: (typeof contentBlock)[number]
      while (true) {
        lastContentIndex--
        lastContentPart = contentBlock[lastContentIndex]

        if (lastContentIndex < 0) {
          // Continue searching in next message
          break
        }

        if (lastContentPart.type !== 'text') {
          contentBlock[lastContentIndex] = withCacheControl(
            contentBlock[lastContentIndex],
          )
          break addCacheControlLoop
        }

        if (lastContentPart.text.length < 2) {
          // continue searching in this message
          continue
        }

        prevMessage.content = [
          ...contentBlock.slice(0, lastContentIndex),
          withCacheControl(lastContentPart),
          ...contentBlock.slice(lastContentIndex + 1),
        ] as typeof contentBlock

        break addCacheControlLoop
      }
      break
    }
  }

  return aggregated
}
