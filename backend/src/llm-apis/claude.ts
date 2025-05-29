import Anthropic, { APIConnectionError } from '@anthropic-ai/sdk'
import { TextBlockParam, MessageParam, ImageBlockParam } from '@anthropic-ai/sdk/resources'
import { AnthropicModel, claudeModels, STOP_MARKER } from 'common/constants'
import { Message } from 'common/types/message'
import { CoreMessage } from 'ai'
import { env } from '../env.mjs'
import { logger } from '../util/logger'
import { removeUndefinedProps } from 'common/util/object'
import { saveMessage } from './message-cost-tracker'
import { transformMessages } from './vercel-ai-sdk/ai-sdk'
import { INITIAL_RETRY_DELAY, sleep } from 'common/util/promise'

const MAX_RETRIES = 3

// Define tools that end the response locally for now
const TOOLS_WHICH_END_THE_RESPONSE = ['end_turn']

export type System = string | Array<TextBlockParam>

// Matches Anthropic's API
export type Thinking = {
  type: 'enabled'
  budget_tokens: number
}

// Convert CoreMessage to Anthropic MessageParam
function convertToAnthropicMessages(coreMessages: CoreMessage[]): MessageParam[] {
  return coreMessages
    .filter(msg => msg.role === 'user' || msg.role === 'assistant') // Anthropic only wants user/assistant in messages array
    .map(msg => {
      let content: string | (TextBlockParam | ImageBlockParam)[]
      if (typeof msg.content === 'string') {
        content = msg.content
      } else {
        content = msg.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text } as TextBlockParam
          } else if (part.type === 'image' && typeof part.image === 'string' && part.image.startsWith('data:')) {
            // Assuming part.image is a data URL string like "data:image/jpeg;base64,..."
            const [header, base64Data] = part.image.split(',')
            if (!header || !base64Data) {
              // Invalid data URL, skip or handle error
              logger.warn({ part }, 'Invalid image data URL in convertToAnthropicMessages')
              return null
            }
            const mimeMatch = header.match(/^data:(image\/(jpeg|png|gif|webp));base64$/)
            if (!mimeMatch || !mimeMatch[1]) {
              logger.warn({ header }, 'Unsupported image MIME type in convertToAnthropicMessages')
              return null
            }
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeMatch[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64Data,
              },
            } as ImageBlockParam
          }
          // Other parts or non-data-URL images are ignored for now
          return null
        }).filter(Boolean) as (TextBlockParam | ImageBlockParam)[]
        
        if (content.length === 0) {
          content = "" // if truly empty after filtering
        }
      }
      return {
        role: msg.role as 'user' | 'assistant',
        content: content,
      }
    }) as MessageParam[]
}

async function* promptClaudeStreamWithoutRetry(
  messages: Message[],
  options: {
    system?: System
    tools?: any[] // Temporarily any[] to avoid tool schema issues
    model?: AnthropicModel
    maxTokens?: number
    thinking?: Thinking
    stopSequences?: string[]
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    repositoryUrl?: string
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
    repositoryUrl,
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
  const anthropicMessages = convertToAnthropicMessages(transformedMsgs)

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
      messages: anthropicMessages,
      system,
      tools: undefined, // Disable tools for now to avoid schema issues
      thinking,
      stop_sequences: stopSequences
        ? stopSequences
        : TOOLS_WHICH_END_THE_RESPONSE.map((tool: string) => `</${tool}>`),
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
        repositoryUrl,
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
    tools?: any[]
    model?: AnthropicModel
    stopSequences?: string[]
    maxTokens?: number
    thinking?: Thinking
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    repositoryUrl?: string
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
    tools?: any[]
    model?: AnthropicModel
    maxTokens?: number
    thinking?: Thinking
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    repositoryUrl?: string
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
    tools?: any[]
    model?: AnthropicModel
    maxTokens?: number
    thinking?: Thinking
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId?: string
    repositoryUrl?: string
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
