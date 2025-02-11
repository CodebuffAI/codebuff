import { Anthropic, APIConnectionError } from '@anthropic-ai/sdk'
import { removeUndefinedProps } from 'common/util/object'
import { Message } from 'common/actions'
import { claudeModels, STOP_MARKER, AnthropicModel } from 'common/constants'
import { match, P } from 'ts-pattern'
import { logger } from './util/logger'
import { limitScreenshots } from 'common/util/messages'
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { sleep } from 'common/util/promise'
import { APIError } from '@anthropic-ai/sdk/error'
import type { Tool, TextBlockParam } from '@anthropic-ai/sdk/resources'

const MAX_SCREENSHOTS = 2

/**
 * Transform messages for Anthropic API.
 * Anthropic's format matches our internal format, but we still want to be explicit
 * about when we don't send images to certain models.
 */
function transformMessages(
  messages: Message[],
  model: AnthropicModel
): Message[] {
  return match(model)
    .with(claudeModels.sonnet, () =>
      limitScreenshots(messages, MAX_SCREENSHOTS)
    )
    .with(claudeModels.haiku, () =>
      messages.map((msg) => ({
        ...msg,
        content: Array.isArray(msg.content)
          ? msg.content.filter((item) => item.type !== 'image')
          : msg.content,
      }))
    )
    .exhaustive()
}

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
  const anthropic = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  })

  const model = options.model ?? claudeModels.sonnet
  const maxTokens = options.maxTokens ?? 8192
  const { system, tools } = options

  const startTime = Date.now()

  // Transform messages before sending to Anthropic
  const transformedMsgs = transformMessages(
    messages,
    options.model ?? claudeModels.sonnet
  )

  const stream = anthropic.messages.stream(
    removeUndefinedProps({
      model,
      max_tokens: maxTokens ?? 8192,
      temperature: 0,
      messages: transformedMsgs,
      system,
      tools,
      stop_sequences: [],
    })
  )

  let content = ''
  let usage = null

  try {
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta') {
        content += chunk.delta.text
        yield chunk.delta.text
      } else if (chunk.type === 'message_delta') {
        if (chunk.delta.usage) {
          usage = chunk.delta.usage
        }
      }
    }
  } finally {
    if (content && !options.ignoreDatabaseAndHelicone) {
      const latencyMs = Date.now() - startTime
      saveMessage({
        id: options.userInputId,
        user_id: options.userId,
        fingerprint_id: options.fingerprintId,
        client_id: options.clientSessionId,
        client_request_id: options.userInputId,
        model,
        request: messages,
        response: content,
        input_tokens: usage?.input_tokens,
        output_tokens: usage?.output_tokens,
        credits_used: usage?.input_tokens + usage?.output_tokens,
        finished_at: new Date(),
        latency_ms: latencyMs,
      }).catch((error) => {
        logger.error({ error }, 'Failed to save message')
      })
    }
  }
}

export async function* promptClaudeStream(
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
  let retryCount = 0
  let retryDelay = INITIAL_RETRY_DELAY

  while (true) {
    try {
      yield* promptClaudeStreamWithoutRetry(messages, options)
      return
    } catch (error) {
      if (error instanceof APIConnectionError) {
        if (retryCount < MAX_RETRIES) {
          logger.warn(
            { error, retryCount, retryDelay },
            'Connection error in Claude API call, retrying...'
          )
          await sleep(retryDelay)
          retryCount++
          retryDelay *= 2
          continue
        }
      }
      throw error
    }
  }
}

export async function promptClaude(
  messages: Message[],
  options: {
    system?: string | Array<TextBlockParam>
    tools?: Tool[]
    model?: AnthropicModel
    maxTokens?: number
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    ignoreDatabaseAndHelicone?: boolean
  }
): Promise<string> {
  let result = ''
  for await (const chunk of promptClaudeStream(messages, options)) {
    result += chunk
  }
  return result
}

export async function promptClaudeWithContinuation(
  messages: Message[],
  options: {
    system?: string | Array<TextBlockParam>
    tools?: Tool[]
    model?: AnthropicModel
    maxTokens?: number
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    ignoreDatabaseAndHelicone?: boolean
  }
): Promise<string> {
  let result = ''
  for await (const chunk of promptClaudeStream(messages, options)) {
    result += chunk
    if (result.includes(STOP_MARKER)) {
      break
    }
  }
  return result
}

export function start() {
  return {
    promptClaude,
    promptClaudeWithContinuation,
    promptClaudeStream,
  }
}
