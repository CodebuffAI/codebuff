import { modelMessageSchema } from 'ai'
import { has, isEqual } from 'lodash'

import type { Logger } from '../types/contracts/logger'
import type { JSONValue } from '../types/json'
import type {
  AssistantMessage,
  AuxiliaryMessageData,
  Message,
  SystemMessage,
  ToolMessage,
  UserMessage,
} from '../types/messages/codebuff-message'
import type { ToolResultOutput } from '../types/messages/content-part'
import type { ProviderMetadata } from '../types/messages/provider-metadata'
import type {
  AssistantModelMessage,
  ModelMessage,
  SystemModelMessage,
  ToolModelMessage,
  UserModelMessage,
} from 'ai'


export function toContentString(msg: ModelMessage): string {
  const { content } = msg
  if (typeof content === 'string') return content
  return content
    .map((item) =>
      item && 'text' in item && typeof item.text === 'string' ? item.text : '',
    )
    .join('\n')
}

export function withCacheControl<
  T extends { providerOptions?: ProviderMetadata },
>(obj: T): T {
  const wrapper = structuredClone(obj)
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
  const wrapper = structuredClone(obj)

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

type NonStringContent<T extends { content: any }> = Omit<T, 'content'> & {
  content: Exclude<T['content'], string>
}
type ModelMessageWithAuxiliaryData = (
  | SystemModelMessage
  | NonStringContent<UserModelMessage>
  | NonStringContent<AssistantModelMessage>
  | ToolModelMessage
) &
  AuxiliaryMessageData

function assistantToCodebuffMessage(
  message: Omit<AssistantMessage, 'content'> & {
    content: Exclude<AssistantMessage['content'], string>[number]
  },
): AssistantMessage {
  // if (message.content.type === 'tool-call') {
  //   return structuredClone({
  //     ...message,
  //     content: [
  //       {
  //         type: 'text',
  //         text: getToolCallString(
  //           message.content.toolName,
  //           message.content.input,
  //           false,
  //         ),
  //       },
  //     ],
  //   })
  // }
  return structuredClone({ ...message, content: [message.content] })
}

function convertToolResultMessage(
  message: ToolMessage,
): ModelMessageWithAuxiliaryData[] {
  if (message.content.length === 0) {
    return [
      structuredClone<ToolModelMessage>({
        ...message,
        role: 'tool',
        content: [
          {
            ...message,
            output: { type: 'json', value: '' },
            type: 'tool-result',
          },
        ],
      }),
    ]
  }
  return message.content.map((c) => {
    if (c.type === 'json') {
      return structuredClone<ToolModelMessage>({
        ...message,
        role: 'tool',
        content: [{ ...message, output: c, type: 'tool-result' }],
      })
    }
    if (c.type === 'media') {
      return structuredClone<UserMessage>({
        ...message,
        role: 'user',
        content: [{ type: 'file', data: c.data, mediaType: c.mediaType }],
      })
    }
    c satisfies never
    throw new Error(
      `Invalid tool output type: ${(c as { type: unknown }).type}`,
    )
  })
}

function convertToolMessage(message: Message): ModelMessageWithAuxiliaryData[] {
  if (message.role === 'system') {
    return [
      {
        ...message,
        content: message.content.map(({ text }) => text).join('\n\n'),
      },
    ]
  }
  if (message.role === 'user') {
    return [structuredClone(message)]
  }
  if (message.role === 'assistant') {
    if (typeof message.content === 'string') {
      return [
        structuredClone({
          ...message,
          content: [{ type: 'text' as const, text: message.content }],
        }),
      ]
    }
    return message.content.map((c) => {
      return assistantToCodebuffMessage({
        ...message,
        content: c,
      })
    })
  }
  if (message.role === 'tool') {
    return convertToolResultMessage(message)
  }
  message satisfies never
  throw new Error(
    `Invalid message role: ${(message as { role: unknown }).role}`,
  )
}

function convertToolMessages(
  messages: Message[],
): ModelMessageWithAuxiliaryData[] {
  const withoutToolMessages: ModelMessageWithAuxiliaryData[] = []
  for (const message of messages) {
    withoutToolMessages.push(...convertToolMessage(message))
  }
  return withoutToolMessages
}

function getAssistantToolCallIds(
  message: ModelMessageWithAuxiliaryData,
): string[] {
  if (message.role !== 'assistant') {
    return []
  }

  return message.content
    .filter((part) => part.type === 'tool-call')
    .map((part) => part.toolCallId)
}

function getToolResultPartId(
  part: ToolModelMessage['content'][number],
): string | null {
  return part.type === 'tool-result' && typeof part.toolCallId === 'string'
    ? part.toolCallId
    : null
}

function filterOrphanModelToolMessages(
  messages: ModelMessageWithAuxiliaryData[],
  logger?: Logger,
): ModelMessageWithAuxiliaryData[] {
  const pendingToolCallIds = new Set<string>()
  const droppedToolResultIds: string[] = []
  const filteredMessages: ModelMessageWithAuxiliaryData[] = []
  let hasStartedToolResponses = false

  for (const message of messages) {
    if (message.role === 'assistant') {
      if (hasStartedToolResponses) {
        pendingToolCallIds.clear()
        hasStartedToolResponses = false
      }
      for (const toolCallId of getAssistantToolCallIds(message)) {
        pendingToolCallIds.add(toolCallId)
      }
      filteredMessages.push(message)
      continue
    }

    if (message.role === 'tool') {
      const validToolResults: ToolModelMessage['content'] = []

      for (const part of message.content) {
        const toolCallId = getToolResultPartId(part)
        if (toolCallId && pendingToolCallIds.has(toolCallId)) {
          validToolResults.push(part)
        } else {
          droppedToolResultIds.push(toolCallId ?? '<missing>')
        }
      }

      if (validToolResults.length > 0) {
        hasStartedToolResponses = true
        filteredMessages.push(
          validToolResults.length === message.content.length
            ? message
            : { ...message, content: validToolResults },
        )
      }
      continue
    }

    pendingToolCallIds.clear()
    hasStartedToolResponses = false
    filteredMessages.push(message)
  }

  if (droppedToolResultIds.length > 0) {
    logger?.debug(
      {
        droppedToolResultCount: droppedToolResultIds.length,
        droppedToolResultIds,
      },
      'Dropped orphan tool-result messages before model request.',
    )
  }

  return filteredMessages
}

export function convertCbToModelMessages({
  messages,
  includeCacheControl = true,
  logger,
}: {
  messages: Message[]
  includeCacheControl?: boolean
  logger?: Logger
}): ModelMessage[] {
  const toolMessagesConverted: ModelMessageWithAuxiliaryData[] =
    filterOrphanModelToolMessages(convertToolMessages(messages), logger)

  const aggregated: ModelMessageWithAuxiliaryData[] = []
  for (const message of toolMessagesConverted) {
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

  // Validate each message against the AI SDK schema
  for (let i = 0; i < aggregated.length; i++) {
    const message = aggregated[i]
    const result = modelMessageSchema.safeParse(message)
    if (!result.success) {
      if (logger) {
        logger.error(
          { message, aggregated, error: result.error },
          `convertCbToModelMessages: Message at index ${i} failed schema validation.`,
        )
      }
      throw new Error(
        `convertCbToModelMessages: Message at index ${i} failed schema validation.\n` +
        `Role: ${message.role}\n` +
        `Message:\n${result.error.message}`,
      )
    }
  }

  return aggregated
}

// type NoContent<T> = T & { content?: never }
export type SystemContent =
  | string
  | SystemMessage['content'][number]
  | SystemMessage['content']
export function systemContent(
  content: SystemContent,
): SystemMessage['content'] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  if (Array.isArray(content)) {
    return content
  }
  return [content]
}

export function systemMessage(
  params:
    | SystemContent
    | ({
      content: SystemContent
    } & Omit<SystemMessage, 'role' | 'content'>),
): SystemMessage {
  if (typeof params === 'object' && 'content' in params) {
    return {
      ...params,
      role: 'system',
      content: systemContent(params.content),
    }
  }
  return {
    role: 'system',
    content: systemContent(params),
  }
}

export type UserContent =
  | string
  | UserMessage['content'][number]
  | UserMessage['content']
export function userContent(content: UserContent): UserMessage['content'] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  if (Array.isArray(content)) {
    return content
  }
  return [content]
}

export function userMessage(
  params:
    | UserContent
    | ({
      content: UserContent
    } & Omit<UserMessage, 'role' | 'content'>),
): UserMessage {
  if (typeof params === 'object' && 'content' in params) {
    return {
      ...params,
      role: 'user',
      content: userContent(params.content),
      sentAt: Date.now(),
    }
  }
  return {
    role: 'user',
    content: userContent(params),
    sentAt: Date.now(),
  }
}

export type AssistantContent =
  | string
  | AssistantMessage['content'][number]
  | AssistantMessage['content']
export function assistantContent(
  content: AssistantContent,
): AssistantMessage['content'] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  if (Array.isArray(content)) {
    return content
  }
  return [content]
}

export function assistantMessage(
  params:
    | AssistantContent
    | ({
      content: AssistantContent
    } & Omit<AssistantMessage, 'role' | 'content'>),
): AssistantMessage {
  if (typeof params === 'object' && 'content' in params) {
    return {
      ...params,
      role: 'assistant',
      content: assistantContent(params.content),
      sentAt: Date.now(),
    }
  }
  return {
    role: 'assistant',
    content: assistantContent(params),
    sentAt: Date.now(),
  }
}

function sanitizeJsonToolResultValue(
  value: unknown,
  seen = new WeakSet<object>(),
): JSONValue {
  if (value === null) return null

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    return null
  }

  if (typeof value !== 'object') {
    return String(value)
  }

  if (seen.has(value)) {
    return '[Circular]'
  }
  seen.add(value)

  const toJson = (value as { toJSON?: unknown }).toJSON
  if (typeof toJson === 'function') {
    const jsonValue = toJson.call(value)
    if (jsonValue !== value) {
      const sanitized = sanitizeJsonToolResultValue(jsonValue, seen)
      seen.delete(value)
      return sanitized
    }
  }

  if (Array.isArray(value)) {
    const result = value.map((item) => sanitizeJsonToolResultValue(item, seen))
    seen.delete(value)
    return result
  }

  const result: Record<string, JSONValue> = {}
  for (const [key, child] of Object.entries(value)) {
    if (
      child === undefined ||
      typeof child === 'function' ||
      typeof child === 'symbol'
    ) {
      continue
    }
    result[key] = sanitizeJsonToolResultValue(child, seen)
  }
  seen.delete(value)
  return result
}

export function jsonToolResult<T extends JSONValue>(
  value: T,
): [
    Extract<ToolResultOutput, { type: 'json' }> & {
      value: T
    },
  ] {
  return [
    {
      type: 'json',
      value: sanitizeJsonToolResultValue(value) as T,
    },
  ]
}

export function mediaToolResult(params: {
  data: string
  mediaType: string
}): [Extract<ToolResultOutput, { type: 'media' }>] {
  const { data, mediaType } = params
  return [
    {
      type: 'media',
      data,
      mediaType,
    },
  ]
}
