import { AnthropicModel } from '@codebuff/common/constants'
import { CoreMessage } from 'ai'
import { generateCompactId } from '@codebuff/common/util/string'
import { env } from '@codebuff/internal/env'
import { logger } from '../util/logger'
import { saveMessage } from './message-cost-tracker'

// Map Codebuff model names to OpenRouter model identifiers (using Claude 4 models)
const anthropicModelToOpenRouter: Record<AnthropicModel, string> = {
  'claude-sonnet-4-20250514': 'anthropic/claude-sonnet-4',
  'claude-3-7-sonnet-20250219': 'anthropic/claude-sonnet-4',
  'claude-3-5-sonnet-20241022': 'anthropic/claude-sonnet-4',
  'claude-opus-4-20250514': 'anthropic/claude-opus-4',
  'claude-3-5-haiku-20241022': 'anthropic/claude-3.5-haiku', // Keep Haiku as 3.5 since no Claude 4 Haiku available
}

interface OpenRouterStreamOptions {
  messages: CoreMessage[]
  model: AnthropicModel
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
  chargeUser?: boolean
  maxRetries?: number
}

/**
 * Stream responses from Claude models via OpenRouter API
 */
export async function* promptOpenRouterStream(
  options: OpenRouterStreamOptions
): AsyncGenerator<string, void, unknown> {
  const {
    messages,
    model,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    maxTokens = 4096,
    temperature = 0.7,
    stopSequences,
    chargeUser = true,
    maxRetries = 2,
  } = options

  const openRouterModel = anthropicModelToOpenRouter[model]
  if (!openRouterModel) {
    throw new Error(`Unsupported model for OpenRouter: ${model}`)
  }

  const startTime = Date.now()
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Reduced logging - only log on first attempt
      if (attempt === 1) {
        logger.info({ model, openRouterModel }, 'OpenRouter fallback')
      }

      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPEN_ROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://codebuff.com',
            'X-Title': 'Codebuff',
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages: messages.map((msg) => ({
              role: msg.role,
              content:
                typeof msg.content === 'string'
                  ? msg.content
                  : Array.isArray(msg.content)
                    ? msg.content
                        .filter((part) => part.type === 'text')
                        .map((part) => (part as { text: string }).text)
                        .join('\n')
                    : JSON.stringify(msg.content),
            })),
            max_tokens: maxTokens,
            temperature,
            stop: stopSequences,
            stream: true,
          }),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `OpenRouter API error (${response.status}): ${errorText}`
        )
      }

      if (!response.body) {
        throw new Error('No response body from OpenRouter')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let content = ''
      let inputTokens = 0
      let outputTokens = 0

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n').filter((line) => line.trim())

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)

                // Handle usage information
                if (parsed.usage) {
                  inputTokens = parsed.usage.prompt_tokens || 0
                  outputTokens = parsed.usage.completion_tokens || 0
                }

                // Handle content delta
                if (parsed.choices?.[0]?.delta?.content) {
                  const delta = parsed.choices[0].delta.content
                  content += delta
                  yield delta
                }
              } catch (parseError) {
                // Skip malformed JSON chunks
                continue
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      // Save message for billing/tracking
      saveMessage({
        messageId: generateCompactId(),
        userId,
        clientSessionId,
        fingerprintId,
        userInputId,
        model,
        request: messages,
        response: content,
        inputTokens,
        outputTokens,
        finishedAt: new Date(),
        latencyMs: Date.now() - startTime,
        chargeUser,
      })

      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      // Only log final failure
      if (attempt === maxRetries) {
        logger.warn(
          { error: lastError.message, model },
          '❌ OpenRouter API failed after all retries'
        )
      }

      if (attempt === maxRetries) {
        throw lastError
      }

      // Wait before retry (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 500)
      )
    }
  }

  throw lastError || new Error('OpenRouter API call failed after all retries')
}
