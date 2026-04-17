import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  isClaudeModel,
  toAnthropicModelId,
} from '@codebuff/common/constants/claude-oauth'
import { isOpenAIProviderModel } from '@codebuff/common/constants/chatgpt-oauth'
import { getErrorObject } from '@codebuff/common/util/error'
import { env } from '@codebuff/internal/env'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { parseJsonBody, requireUserFromApiKey } from '../_helpers'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

const tokenCountRequestSchema = z.object({
  messages: z.array(z.any()),
  system: z.string().optional(),
  model: z.string().optional(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    input_schema: z.any().optional(),
  })).optional(),
})

type TokenCountRequest = z.infer<typeof tokenCountRequestSchema>

const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-7'

export async function postTokenCount(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
  fetch: typeof globalThis.fetch
}) {
  const {
    req,
    getUserInfoFromApiKey,
    logger: baseLogger,
    loggerWithContext,
    trackEvent,
    fetch,
  } = params

  // Authenticate user
  const userResult = await requireUserFromApiKey({
    req,
    getUserInfoFromApiKey,
    logger: baseLogger,
    loggerWithContext,
    trackEvent,
    authErrorEvent: AnalyticsEvent.TOKEN_COUNT_AUTH_ERROR,
  })

  if (!userResult.ok) {
    return userResult.response
  }

  const { userId, logger } = userResult.data

  // Parse request body
  const bodyResult = await parseJsonBody({
    req,
    schema: tokenCountRequestSchema,
    logger,
    trackEvent,
    validationErrorEvent: AnalyticsEvent.TOKEN_COUNT_VALIDATION_ERROR,
  })

  if (!bodyResult.ok) {
    return bodyResult.response
  }

  const { messages, system, model, tools } = bodyResult.data

  try {
    const useOpenAI = model != null && false // isOpenAIProviderModel(model)
    const inputTokens = useOpenAI
      ? await countTokensViaOpenAI({ messages, system, model, fetch, logger })
      : await countTokensViaAnthropic({
        messages,
        system,
        model,
        tools,
        fetch,
        logger,
      })

    logger.info({
      userId,
      messageCount: messages.length,
      hasSystem: !!system,
      hasTools: !!tools,
      toolCount: tools?.length,
      model: model ?? DEFAULT_ANTHROPIC_MODEL,
      tokenCount: inputTokens,
      provider: useOpenAI ? 'openai' : 'anthropic',
    },
      `Token count: ${inputTokens}`
    )

    return NextResponse.json({ inputTokens })
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), userId },
      'Failed to count tokens',
    )

    return NextResponse.json(
      { error: 'Failed to count tokens' },
      { status: 500 },
    )
  }
}

// Buffer to add to token count for non-Anthropic models since tokenizers differ
const NON_ANTHROPIC_TOKEN_BUFFER = 0.3

export async function countTokensViaOpenAI(params: {
  messages: TokenCountRequest['messages']
  system: string | undefined
  model: string
  fetch: typeof globalThis.fetch
  logger: Logger
}): Promise<number> {
  const { messages, system, model, fetch, logger } = params

  const openaiModelId = model.startsWith('openai/')
    ? model.slice('openai/'.length)
    : model

  const input = convertToResponsesApiInput(messages)

  const response = await fetch(
    'https://api.openai.com/v1/responses/input_tokens',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: openaiModelId,
        input,
        ...(system && { instructions: system }),
      }),
    },
  )

  if (!response.ok) {
    const errorText = await response.text()
    logger.error(
      { status: response.status, errorText, model },
      'OpenAI token count API error',
    )
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  return data.input_tokens
}

export type ResponsesApiContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }

export type ResponsesApiInputItem =
  | { type: 'message'; role: 'user' | 'assistant' | 'developer'; content: string | ResponsesApiContentPart[] }
  | { type: 'function_call'; id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }

export function convertToResponsesApiInput(
  messages: TokenCountRequest['messages'],
): ResponsesApiInputItem[] {
  const input: ResponsesApiInputItem[] = []

  for (const message of messages) {
    if (message.role === 'system') {
      const content = buildMessageContent(message.content)
      if (content) {
        input.push({ type: 'message', role: 'developer', content })
      }
      continue
    }

    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.toolCallId ?? 'unknown',
        output: formatToolContent(message.content),
      })
      continue
    }

    if (message.role === 'user') {
      const content = buildMessageContent(message.content)
      if (content) {
        input.push({ type: 'message', role: 'user', content })
      }
      continue
    }

    if (message.role === 'assistant') {
      const content = buildMessageContent(message.content)
      if (content) {
        input.push({ type: 'message', role: 'assistant', content })
      }
      if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'tool-call') {
            input.push({
              type: 'function_call',
              id: part.toolCallId ?? 'unknown',
              name: part.toolName,
              arguments: JSON.stringify(part.input ?? {}),
            })
          }
        }
      }
    }
  }

  return input
}

function buildMessageContent(
  content: unknown,
): string | ResponsesApiContentPart[] | null {
  if (typeof content === 'string') return content || null
  if (!Array.isArray(content)) {
    const text = JSON.stringify(content)
    return text || null
  }

  const hasImages = content.some(
    (part) => part.type === 'image' && typeof part.image === 'string' && part.image,
  )

  if (!hasImages) {
    const text = extractTextParts(content)
    return text || null
  }

  const parts: ResponsesApiContentPart[] = []
  for (const part of content) {
    if (part.type === 'text' && typeof part.text === 'string' && part.text) {
      parts.push({ type: 'input_text', text: part.text })
    } else if (part.type === 'json') {
      const text = typeof part.value === 'string' ? part.value : JSON.stringify(part.value)
      if (text) {
        parts.push({ type: 'input_text', text })
      }
    } else if (part.type === 'image') {
      const imageUrl = toImageUrl(part.image, part.mediaType)
      if (imageUrl) {
        parts.push({ type: 'input_image', image_url: imageUrl })
      }
    }
  }

  return parts.length > 0 ? parts : null
}

function toImageUrl(image: unknown, mediaType?: string): string | null {
  if (typeof image !== 'string' || !image) return null
  if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('data:')) {
    return image
  }
  return `data:${mediaType ?? 'image/png'};base64,${image}`
}

function extractTextParts(content: Array<Record<string, unknown>>): string {
  const parts: string[] = []
  for (const part of content) {
    if (part.type === 'text' && typeof part.text === 'string') {
      parts.push(part.text)
    } else if (part.type === 'json') {
      parts.push(typeof part.value === 'string' ? part.value : JSON.stringify(part.value))
    }
  }
  return parts.join('\n')
}

async function countTokensViaAnthropic(params: {
  messages: TokenCountRequest['messages']
  system: string | undefined
  model: string | undefined
  tools: TokenCountRequest['tools']
  fetch: typeof globalThis.fetch
  logger: Logger
}): Promise<number> {
  const { messages, system, model, tools, fetch, logger } = params

  // Convert messages to Anthropic format
  const anthropicMessages = convertToAnthropicMessages(messages)

  // Convert model from OpenRouter format (e.g. "anthropic/claude-opus-4.5") to Anthropic format (e.g. "claude-opus-4-5-20251101")
  // For non-Anthropic models, use the default Anthropic model for token counting
  const isNonAnthropicModel = !model || !isClaudeModel(model)
  const anthropicModelId = isNonAnthropicModel
    ? DEFAULT_ANTHROPIC_MODEL
    : toAnthropicModelId(model)

  // Use the count_tokens endpoint (beta) or make a minimal request
  const response = await fetch(
    'https://api.anthropic.com/v1/messages/count_tokens',
    {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'token-counting-2024-11-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: anthropicModelId,
        messages: anthropicMessages,
        ...(system && { system }),
        ...(tools && { tools }),
      }),
    },
  )

  if (!response.ok) {
    const errorText = await response.text()
    logger.error(
      {
        status: response.status,
        errorText,
        messages: anthropicMessages,
        system,
        model,
      },
      'Anthropic token count API error',
    )
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const baseTokens = data.input_tokens

  // Add 30% buffer for OpenAI and Gemini models since their tokenizers differ from Anthropic's
  // Other non-Anthropic models (x-ai, qwen, deepseek, etc.) are routed through providers that
  // use similar tokenization, so the buffer is not needed and was causing premature context pruning.
  const isOpenAIModel = model ? isOpenAIProviderModel(model) : false
  const isGeminiModel = model?.startsWith('google/') ?? false
  if (isOpenAIModel || isGeminiModel) {
    return Math.ceil(baseTokens * (1 + NON_ANTHROPIC_TOKEN_BUFFER))
  }

  return baseTokens
}

export function convertToAnthropicMessages(
  messages: TokenCountRequest['messages'],
): Array<{ role: 'user' | 'assistant'; content: any }> {
  const result: Array<{ role: 'user' | 'assistant'; content: any }> = []

  for (const message of messages) {
    // Skip system messages - they're handled separately
    if (message.role === 'system') {
      continue
    }

    // Handle tool messages by converting to user messages with tool_result
    if (message.role === 'tool') {
      result.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId ?? 'unknown',
            content: formatToolContent(message.content),
          },
        ],
      })
      continue
    }

    // Handle user and assistant messages
    if (message.role === 'user' || message.role === 'assistant') {
      const content = convertContentToAnthropic(message.content, message.role)
      if (content) {
        result.push({
          role: message.role,
          content,
        })
      }
    }
  }

  return result
}

export function convertContentToAnthropic(
  content: any,
  role: 'user' | 'assistant',
): any {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return JSON.stringify(content)
  }

  const anthropicContent: any[] = []

  for (const part of content) {
    if (part.type === 'text') {
      const text = part.text.trim()
      if (text) {
        anthropicContent.push({ type: 'text', text })
      }
    } else if (part.type === 'tool-call' && role === 'assistant') {
      anthropicContent.push({
        type: 'tool_use',
        id: part.toolCallId ?? 'unknown',
        name: part.toolName,
        input: part.input ?? {},
      })
    } else if (part.type === 'image') {
      // Handle image content - the image field can be base64 data or a URL string
      const imageData = part.image
      if (typeof imageData === 'string' && imageData) {
        if (
          imageData.startsWith('http://') ||
          imageData.startsWith('https://')
        ) {
          // URL-based image
          anthropicContent.push({
            type: 'image',
            source: {
              type: 'url',
              url: imageData,
            },
          })
        } else {
          // Base64 encoded image data
          anthropicContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: part.mediaType ?? 'image/png',
              data: imageData,
            },
          })
        }
      }
      // Skip images without valid data
    } else if (part.type === 'json') {
      const text =
        typeof part.value === 'string'
          ? part.value.trim()
          : JSON.stringify(part.value).trim()
      if (text) {
        anthropicContent.push({
          type: 'text',
          text,
        })
      }
    }
  }

  return anthropicContent.length > 0 ? anthropicContent : undefined
}

export function formatToolContent(content: any): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part.type === 'text') return part.text
        if (part.type === 'json') return JSON.stringify(part.value)
        return JSON.stringify(part)
      })
      .join('\n')
  }
  return JSON.stringify(content)
}
