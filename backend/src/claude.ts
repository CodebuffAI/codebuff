import Anthropic from '@anthropic-ai/sdk'
import { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'
import { removeUndefinedProps } from 'common/util/object'
import { Message, ToolCall } from 'common/actions'
import { claudeModels, STOP_MARKER } from 'common/constants'
import { debugLog } from './util/debug'
import { RATE_LIMIT_POLICY } from './constants'
import { env } from './env.mjs'
import { saveMessage } from './billing/message'

export type model_types = (typeof claudeModels)[keyof typeof claudeModels]

export type System = string | Array<TextBlockParam>

export const promptClaudeStream = async function* (
  messages: Message[],
  options: {
    system?: System
    tools?: Tool[]
    model?: model_types
    maxTokens?: number
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    ignoreHelicone?: boolean
  },
  userId?: string
): AsyncGenerator<string, void, unknown> {
  const {
    model = claudeModels.sonnet,
    system,
    tools,
    clientSessionId,
    fingerprintId,
    userInputId,
    maxTokens,
    ignoreHelicone = false,
  } = options

  const apiKey = env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const anthropic = new Anthropic({
    apiKey,
    ...(ignoreHelicone
      ? {}
      : {
          baseURL: 'https://anthropic.helicone.ai/',
        }),
    defaultHeaders: {
      'anthropic-beta': 'prompt-caching-2024-07-31',
      ...(ignoreHelicone
        ? {}
        : {
            'Helicone-Auth': `Bearer ${env.HELICONE_API_KEY}`,
            'Helicone-User-Id': fingerprintId,
            'Helicone-RateLimit-Policy': RATE_LIMIT_POLICY,
            'Helicone-LLM-Security-Enabled': 'true',
          }),
    },
  })

  const stream = anthropic.messages.stream(
    removeUndefinedProps({
      model,
      max_tokens: maxTokens ?? 4096,
      temperature: 0,
      messages,
      system,
      tools,
      stop_sequences: [],
    })
  )

  let toolInfo = {
    name: '',
    id: '',
    json: '',
  }
  let messageId: string | undefined
  let inputTokens = 0
  let outputTokens = 0
  let cacheCreationInputTokens = 0
  let cacheReadInputTokens = 0
  let fullResponse = ''
  for await (const chunk of stream) {
    const { type } = chunk

    // Start of turn
    if (type === 'message_start') {
      messageId = chunk.message.id
      inputTokens = chunk.message.usage.input_tokens
      outputTokens = chunk.message.usage.output_tokens
      // @ts-ignore
      cacheReadInputTokens = chunk.message.usage.cache_read_input_tokens ?? 0
      cacheCreationInputTokens =
        // @ts-ignore
        chunk.message.usage.cache_creation_input_tokens ?? 0
    }

    // Text (most common case)
    if (type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      fullResponse += chunk.delta.text
      yield chunk.delta.text
    }

    // Tool use!
    if (
      type === 'content_block_start' &&
      chunk.content_block.type === 'tool_use'
    ) {
      const { name, id } = chunk.content_block
      toolInfo = {
        name,
        id,
        json: '',
      }
    }
    if (
      type === 'content_block_delta' &&
      chunk.delta.type === 'input_json_delta'
    ) {
      toolInfo.json += chunk.delta.partial_json
    }
    if (type === 'message_delta' && chunk.delta.stop_reason === 'tool_use') {
      const { name, id, json } = toolInfo
      const input = JSON.parse(json)
      console.error('tried to yield tool call', name, id, input)
      // yield { name, id, input }
    }

    // End of turn
    if (type === 'message_delta' && chunk.delta.stop_reason === 'end_turn') {
      if (!messageId) {
        console.error('No messageId found')
        break
      }

      outputTokens += chunk.usage.output_tokens
      const [last, ...context] = messages.slice().reverse()
      saveMessage({
        messageId,
        userId,
        clientSessionId,
        fingerprintId,
        userInputId,
        context,
        request: last,
        model,
        response: fullResponse,
        inputTokens,
        outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        finishedAt: new Date(),
      })
    }
  }
}

export const promptClaude = async (
  messages: Message[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    system?: string | Array<TextBlockParam>
    tools?: Tool[]
    model?: model_types
    maxTokens?: number
    ignoreHelicone?: boolean
  }
) => {
  let fullResponse = ''
  for await (const chunk of promptClaudeStream(messages, options)) {
    fullResponse += chunk
  }
  return fullResponse
}

export async function promptClaudeWithContinuation(
  messages: Message[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    system?: string
    model?: model_types
    ignoreHelicone?: boolean
  }
) {
  let fullResponse = ''
  let continuedMessage: Message | null = null
  let isComplete = false

  // Add the instruction to end with the stop market to the system prompt
  if (options.system) {
    options.system += `\n\nAlways end your response with "${STOP_MARKER}".`
  } else {
    options.system = `Always end your response with "${STOP_MARKER}".`
  }

  while (!isComplete) {
    const messagesWithContinuedMessage = continuedMessage
      ? [...messages, continuedMessage]
      : messages
    debugLog(
      'prompt claude with continuation',
      messagesWithContinuedMessage.length
    )
    const stream = promptClaudeStream(messagesWithContinuedMessage, options)

    for await (const chunk of stream) {
      fullResponse += chunk
    }

    if (continuedMessage) {
      debugLog('Continuation response:', fullResponse)
      console.log('got continuation response')
    }

    if (fullResponse.includes(STOP_MARKER)) {
      isComplete = true
      fullResponse = fullResponse.replace(STOP_MARKER, '')
    } else {
      continuedMessage = {
        role: 'assistant',
        content: fullResponse,
      }
    }
  }

  return { response: fullResponse }
}
