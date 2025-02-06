import Anthropic, { APIConnectionError } from '@anthropic-ai/sdk'
import { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'
import { removeUndefinedProps } from 'common/util/object'
import { Message } from 'common/actions'
import { claudeModels, STOP_MARKER, AnthropicModel } from 'common/constants'
import { match, P } from 'ts-pattern'

/**
 * Transform messages for Anthropic API.
 * Anthropic's format matches our internal format, but we still want to be explicit
 * about when we don't send images to certain models.
 *
 * @param message The message to transform
 * @param model The Anthropic model being used
 * @returns The transformed message
 */
function transformedMessage(message: Message, model: AnthropicModel): Message {
  return match(model)
    .with(claudeModels.sonnet, () => message) // Sonnet supports images natively
    .with(claudeModels.haiku, () =>
      match<Message, Message>(message)
        .with({ content: P.string }, () => message)
        .with(
          {
            content: P.array({
              type: P.string,
            }),
          },
          (msg) => {
            const hasImages = msg.content.some(
              (obj: { type: string }) => obj.type === 'image'
            )
            if (hasImages) {
              logger.info(
                'Stripping images from message - Claude Haiku does not support images'
              )
              return {
                ...msg,
                content: msg.content.filter(
                  (obj: { type: string }) => obj.type !== 'image'
                ),
              }
            }
            return msg
          }
        )
        .exhaustive()
    )
    .exhaustive()
}
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { logger } from './util/logger'
import { sleep } from 'common/util/promise'
import { APIError } from '@anthropic-ai/sdk/error'

const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second

export type System = string | Array<TextBlockParam>

async function* promptClaudeStreamWithoutRetry(
  messages: Message[],
  options: {
    system?: System
    tools?: Tool[]
    model?: AnthropicModel
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

  // Transform messages before sending to Anthropic
  const transformedMessages = messages.map((msg) =>
    transformedMessage(msg, options.model ?? claudeModels.sonnet)
  )

  const stream = anthropic.messages.stream(
    removeUndefinedProps({
      model,
      max_tokens: maxTokens ?? 8192,
      temperature: 0,
      messages: transformedMessages,
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

export const promptClaudeStream = (
  messages: Message[],
  options: {
    system?: System
    tools?: Tool[]
    model?: AnthropicModel
    maxTokens?: number
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    ignoreDatabaseAndHelicone?: boolean
  }
): ReadableStream<string> => {
  // Use a readable stream to prevent base stream from being closed prematurely.
  return new ReadableStream({
    async start(controller) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const baseStream = promptClaudeStreamWithoutRetry(messages, options)

          // Stream all chunks from the generator to the controller
          for await (const chunk of baseStream) {
            controller.enqueue(chunk)
          }
          controller.close()
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
              continue
            }
          }

          // For other types of errors, throw immediately
          const parsedError = error as APIError
          controller.error(
            new Error(
              `Anthropic API error: ${parsedError.message}. Please try again later or reach out to ${env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.`
            )
          )
          return
        }
      }

      controller.error(
        new Error(
          `Sorry, system's a bit overwhelmed. Please try again later or reach out to ${env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.`
        )
      )
    },
  })
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
    model?: AnthropicModel
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
    model?: AnthropicModel
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
