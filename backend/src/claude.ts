import Anthropic, { APIConnectionError } from '@anthropic-ai/sdk'
import { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'
import { removeUndefinedProps } from 'common/util/object'
import { Message } from 'common/actions'
import { claudeModels, STOP_MARKER } from 'common/constants'
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { logger } from './util/logger'
import { sleep } from 'common/util/promise'
import { APIError } from '@anthropic-ai/sdk/error'

const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second

export type model_types = (typeof claudeModels)[keyof typeof claudeModels]

export type System = string | Array<TextBlockParam>

async function* promptClaudeStreamWithoutRetry(
  messages: Message[],
  options: {
    system?: System
    tools?: Tool[]
    model?: model_types
    maxTokens?: number
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    ignoreDatabaseAndHelicone?: boolean
  }
): AsyncGenerator<string, void, unknown> {
  const {
    model = claudeModels.sonnet,
    system,
    tools,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    maxTokens,
    ignoreDatabaseAndHelicone = false,
  } = options

  const apiKey = env.ANTHROPIC_API_KEY2

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const anthropic = new Anthropic({
    apiKey,
    ...(ignoreDatabaseAndHelicone
      ? {}
      : {
          baseURL: 'https://anthropic.helicone.ai/',
        }),
    defaultHeaders: {
      'anthropic-beta': 'prompt-caching-2024-07-31',
      ...(ignoreDatabaseAndHelicone
        ? {}
        : {
            'Helicone-Auth': `Bearer ${env.HELICONE_API_KEY}`,
            'Helicone-User-Id': fingerprintId,
            // 'Helicone-RateLimit-Policy': RATE_LIMIT_POLICY,
            'Helicone-LLM-Security-Enabled': 'true',
          }),
    },
  })

  const startTime = Date.now()

  const stream = anthropic.messages.stream(
    removeUndefinedProps({
      model,
      max_tokens: maxTokens ?? 8192,
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
      logger.error({ name, id, input }, 'Tried to yield tool call')
    }

    // End of turn
    if (
      type === 'message_delta' &&
      'usage' in chunk &&
      !ignoreDatabaseAndHelicone
    ) {
      if (!messageId) {
        logger.error('No messageId found')
        break
      }

      outputTokens += chunk.usage.output_tokens

      saveMessage({
        messageId,
        userId,
        clientSessionId,
        fingerprintId,
        userInputId,
        request: messages,
        model,
        response: fullResponse,
        inputTokens,
        outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        finishedAt: new Date(),
        latencyMs: Date.now() - startTime,
      })
    }
  }
}

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
    userId?: string
    ignoreDatabaseAndHelicone?: boolean
  }
): AsyncGenerator<string, void, unknown> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      yield* promptClaudeStreamWithoutRetry(messages, options)
      return
    } catch (error) {
      // Only retry on connection errors (e.g. internal server error, overloaded, etc.)
      if (error instanceof APIConnectionError) {
        logger.error(
          { error, attempt },
          'Claude API connection error, retrying...'
        )

        if (attempt < MAX_RETRIES - 1) {
          // Exponential backoff
          const delayMs = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
          await sleep(delayMs)
        }
      } else {
        // For other types of errors, throw immediately
        const parsedError = error as APIError
        throw new Error(
          `Anthropic API error: ${parsedError.message}. Please try again later or reach out to ${env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.`
        )
      }
    }
  }

  throw new Error(
    `Sorry, system's a bit overwhelmed. Please try again later or reach out to ${env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.`
  )
}

export const promptClaude = async (
  messages: Message[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    system?: string | Array<TextBlockParam>
    tools?: Tool[]
    model?: model_types
    maxTokens?: number
    ignoreDatabaseAndHelicone?: boolean
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
    userId?: string
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
    logger.debug(
      { messagesLength: messagesWithContinuedMessage.length },
      'Prompt claude with continuation'
    )
    const stream = promptClaudeStream(messagesWithContinuedMessage, options)

    for await (const chunk of stream) {
      fullResponse += chunk
    }

    if (continuedMessage) {
      logger.debug({ fullResponse }, 'Got continuation response')
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
