import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  isClaudeModel,
  toAnthropicModelId,
} from '@codebuff/common/constants/claude-oauth'
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
})

type TokenCountRequest = z.infer<typeof tokenCountRequestSchema>

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

  const { messages, system, model } = bodyResult.data

  try {
    const inputTokens = await countTokensViaAnthropic({
      messages,
      system,
      model,
      fetch,
      logger,
    })

    trackEvent({
      event: AnalyticsEvent.TOKEN_COUNT_REQUEST,
      userId,
      properties: {
        messageCount: messages.length,
        hasSystem: !!system,
        model: model ?? 'claude-opus-4-5-20251101',
        inputTokens,
      },
      logger,
    })

    return NextResponse.json({ inputTokens })
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), userId },
      'Failed to count tokens via Anthropic API',
    )

    trackEvent({
      event: AnalyticsEvent.TOKEN_COUNT_ERROR,
      userId,
      properties: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      logger,
    })

    return NextResponse.json(
      { error: 'Failed to count tokens' },
      { status: 500 },
    )
  }
}

// Buffer to add to token count for non-Anthropic models since tokenizers differ
const NON_ANTHROPIC_TOKEN_BUFFER = 0.3

async function countTokensViaAnthropic(params: {
  messages: TokenCountRequest['messages']
  system: string | undefined
  model: string | undefined
  fetch: typeof globalThis.fetch
  logger: Logger
}): Promise<number> {
  const { messages, system, model, fetch, logger } = params

  // Convert messages to Anthropic format
  const anthropicMessages = convertToAnthropicMessages(messages)

  // Convert model from OpenRouter format (e.g. "anthropic/claude-opus-4.5") to Anthropic format (e.g. "claude-opus-4-5-20251101")
  // For non-Anthropic models, use the default Anthropic model for token counting
  const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-5-20251101'
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

  // Add 30% buffer for non-Anthropic models since tokenizers differ
  if (isNonAnthropicModel) {
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
        if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
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
