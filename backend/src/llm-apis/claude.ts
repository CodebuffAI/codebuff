import { Anthropic, APIConnectionError } from '@anthropic-ai/sdk'
import type { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'
import { AnthropicModel, claudeModels, STOP_MARKER } from 'common/constants'
import { Message } from 'common/types/message'
import { limitScreenshots } from 'common/util/messages'
import { removeUndefinedProps } from 'common/util/object'
import { sleep } from 'common/util/promise'
import { match } from 'ts-pattern'
import { env } from '../env.mjs'
import { saveMessage } from '../llm-apis/message-cost-tracker'
import { TOOLS_WHICH_END_THE_RESPONSE } from '../tools'
import { logger } from '../util/logger'

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
    .with(claudeModels.sonnet3_7, () =>
      limitScreenshots(messages, MAX_SCREENSHOTS)
    )
    .with(claudeModels.opus4, () => limitScreenshots(messages, MAX_SCREENSHOTS))
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

// Matches Anthropic's API
export type Thinking = {
  type: 'enabled'
  budget_tokens: number
}

async function* promptClaudeStreamWithoutRetry(
  messages: Message[],
  options: {
    system?: System
    tools?: Tool[]
    model?: AnthropicModel
    maxTokens?: number
    thinking?: Thinking
    stopSequences?: string[]
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    ignoreDatabaseAndHelicone?: boolean
    chargeUser?: boolean
  }
): AsyncGenerator<string, void, unknown> {
  const {
    model = claudeModels.sonnet,
    system,
    tools,
    thinking,
    stopSequences,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    maxTokens,
    ignoreDatabaseAndHelicone = false,
    chargeUser = true,
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
            'Helicone-LLM-Security-Enabled': 'true',
          }),
    },
  })

  const startTime = Date.now()

  // Transform messages before sending to Anthropic
  const transformedMsgs = transformMessages(messages, model)

  let content = ''
  let usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number | undefined
    cache_creation_input_tokens: number | undefined
  } | null = null

  let messageId: string | undefined
  let inputTokens = 0
  let outputTokens = 0
  let cacheCreationInputTokens = 0
  let cacheReadInputTokens = 0

  const stream = anthropic.messages.stream(
    removeUndefinedProps({
      model,
      max_tokens: maxTokens ?? (model === claudeModels.sonnet ? 32_000 : 8096),
      temperature: thinking?.type === 'enabled' ? 1 : 0,
      messages: transformedMsgs,
      system,
      tools,
      thinking,
      stop_sequences: stopSequences
        ? stopSequences
        : TOOLS_WHICH_END_THE_RESPONSE.map((tool) => `</${tool}>`),
    })
  )

  for await (const chunk of stream) {
    if (chunk.type === 'message_start') {
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
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      content += chunk.delta.text
      yield chunk.delta.text
    }

    // // Tool use!
    // if (
    //   type === 'content_block_start' &&
    //   chunk.content_block.type === 'tool_use'
    // ) {
    //   const { name, id } = chunk.content_block
    //   toolInfo = {
    //     name,
    //     id,
    //     json: '',
    //   }
    // }
    // if (
    //   type === 'content_block_delta' &&
    //   chunk.delta.type === 'input_json_delta'
    // ) {
    //   toolInfo.json += chunk.delta.partial_json
    // }
    // if (type === 'message_delta' && chunk.delta.stop_reason === 'tool_use') {
    //   const { name, id, json } = toolInfo
    //   const input = JSON.parse(json)
    //   logger.error({ name, id, input }, 'Tried to yield tool call')
    // }

    if (
      chunk.type === 'message_delta' &&
      'usage' in chunk &&
      !ignoreDatabaseAndHelicone
    ) {
      if (!messageId) {
        logger.error('No messageId found')
        break
      }
      outputTokens += chunk.usage.output_tokens

      const latencyMs = Date.now() - startTime
      saveMessage({
        messageId,
        userId,
        fingerprintId,
        clientSessionId,
        userInputId,
        model,
        request: messages,
        response: content,
        inputTokens,
        outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        finishedAt: new Date(),
        latencyMs,
        chargeUser,
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
    stopSequences?: string[]
    maxTokens?: number
    thinking?: Thinking
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    ignoreDatabaseAndHelicone?: boolean
    chargeUser?: boolean
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
    thinking?: Thinking
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    ignoreDatabaseAndHelicone?: boolean
    stopSequences?: string[]
    chargeUser?: boolean
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
    thinking?: Thinking
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    ignoreDatabaseAndHelicone?: boolean
    stopSequences?: string[]
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
