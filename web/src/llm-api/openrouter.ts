import {
  insertMessage as insertMessageIntoBigquery,
  setupBigQuery,
} from '@codebuff/bigquery'
import { consumeCreditsAndAddAgentStep as consumeCreditsAndAddMessage } from '@codebuff/billing'
import { PROFIT_MARGIN } from '@codebuff/common/old-constants'
import { getErrorObject } from '@codebuff/common/util/error'
import { env } from '@codebuff/internal/env'

import { OpenRouterStreamChatCompletionChunkSchema } from './type/openrouter'

import type { OpenRouterStreamChatCompletionChunk } from './type/openrouter'

import { logger } from '@/util/logger'

type StreamState = { responseText: string; reasoningText: string }

export async function handleOpenRouterStream({
  body,
  userId,
  agentId,
}: {
  body: any
  userId: string
  agentId: string
}) {
  // Ensure usage tracking is enabled
  if (body.usage === undefined) {
    body.usage = {}
  }
  body.usage.include = true

  const startTime = new Date()
  let clientId: string | null
  if (
    body.codebuff_metadata?.client_id &&
    typeof body.codebuff_metadata?.client_id === 'string'
  ) {
    clientId = body.codebuff_metadata.client_id
  } else {
    logger.warn({ body }, 'Received request without client_id')
    clientId = null
  }
  let clientRequestId: string | null
  if (
    body.codebuff_metadata?.client_request_id &&
    typeof body.codebuff_metadata?.client_request_id === 'string'
  ) {
    clientRequestId = body.codebuff_metadata.client_request_id
  } else {
    logger.warn({ body }, 'Received request without client_request_id')
    clientRequestId = null
  }

  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPEN_ROUTER_API_KEY}`,
        'HTTP-Referer': 'https://codebuff.com',
        'X-Title': 'Codebuff',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Failed to get response reader')
  }

  let heartbeatInterval: NodeJS.Timeout
  let state: StreamState = { responseText: '', reasoningText: '' }
  let clientDisconnected = false

  // Create a ReadableStream that Next.js can handle
  const stream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder()
      let buffer = ''

      // Send initial connection message
      controller.enqueue(
        new TextEncoder().encode(`: connected ${new Date().toISOString()}\n`)
      )

      // Start heartbeat
      heartbeatInterval = setInterval(() => {
        if (!clientDisconnected) {
          try {
            controller.enqueue(
              new TextEncoder().encode(
                `: heartbeat ${new Date().toISOString()}\n\n`
              )
            )
          } catch {
            // client disconnected, ignore error
          }
        }
      }, 30000)

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })
          let lineEnd = buffer.indexOf('\n')

          while (lineEnd !== -1) {
            const line = buffer.slice(0, lineEnd + 1)
            buffer = buffer.slice(lineEnd + 1)

            state = await handleLine({
              userId,
              agentId,
              clientId,
              clientRequestId,
              startTime,
              request: body,
              line,
              state,
            })

            if (!clientDisconnected) {
              try {
                controller.enqueue(new TextEncoder().encode(line))
              } catch (error) {
                logger.warn(
                  'Client disconnected during stream, continuing for billing'
                )
                clientDisconnected = true
              }
            }

            lineEnd = buffer.indexOf('\n')
          }
        }

        if (!clientDisconnected) {
          controller.close()
        }
      } catch (error) {
        if (!clientDisconnected) {
          controller.error(error)
        } else {
          logger.warn(
            getErrorObject(error),
            'Error after client disconnect in OpenRouter stream'
          )
        }
      } finally {
        clearInterval(heartbeatInterval)
      }
    },
    cancel() {
      clearInterval(heartbeatInterval)
      clientDisconnected = true
      logger.warn(
        'Client cancelled stream, continuing OpenRouter consumption for billing'
      )
    },
  })

  return stream
}

async function handleLine({
  userId,
  agentId,
  clientId,
  clientRequestId,
  startTime,
  request,
  line,
  state,
}: {
  userId: string
  agentId: string
  clientId: string | null
  clientRequestId: string | null
  startTime: Date
  request: unknown
  line: string
  state: StreamState
}): Promise<StreamState> {
  if (!line.startsWith('data: ')) {
    return state
  }

  const raw = line.slice('data: '.length)
  if (raw === '[DONE]\n') {
    return state
  }

  // Parse the string into an object
  let obj
  try {
    obj = JSON.parse(raw)
  } catch (error) {
    logger.warn(
      `Received non-JSON OpenRouter response: ${JSON.stringify(getErrorObject(error), null, 2)}`
    )
    return state
  }

  // Extract usage
  const parsed = OpenRouterStreamChatCompletionChunkSchema.safeParse(obj)
  if (!parsed.success) {
    logger.warn(
      `Unable to parse OpenRotuer response: ${JSON.stringify(getErrorObject(parsed.error), null, 2)}`
    )
    return state
  }

  return await handleResponse({
    userId,
    agentId,
    clientId,
    clientRequestId,
    startTime,
    request,
    data: parsed.data,
    state,
  })
}

async function handleResponse({
  userId,
  agentId,
  clientId,
  clientRequestId,
  startTime,
  request,
  data,
  state,
}: {
  userId: string
  agentId: string
  clientId: string | null
  clientRequestId: string | null
  startTime: Date
  request: unknown
  data: OpenRouterStreamChatCompletionChunk
  state: StreamState
}): Promise<StreamState> {
  state = await handleStreamChunk({ data, state })

  if ('error' in data || !data.usage) {
    // Stream not finished
    return state
  }
  const usage = data.usage

  // do not await this
  setupBigQuery({ logger }).then(async () => {
    const success = await insertMessageIntoBigquery({
      row: {
        id: data.id,
        user_id: userId,
        finished_at: new Date(),
        created_at: startTime,
        request,
        reasoning_text: state.reasoningText,
        response: state.responseText,
        output_tokens: usage.completion_tokens,
        reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens,
        cost: usage.cost,
        upstream_inference_cost: usage.cost_details?.upstream_inference_cost,
        input_tokens: usage.prompt_tokens,
        cache_read_input_tokens: usage.prompt_tokens_details?.cached_tokens,
      },
      logger,
    })
    if (!success) {
      logger.error({ request }, 'Failed to insert message into BigQuery')
    }
  })
  const openRouterCost = usage.cost ?? 0
  const upstreamCost = usage.cost_details?.upstream_inference_cost ?? 0
  const cost = openRouterCost + upstreamCost

  await consumeCreditsAndAddMessage({
    messageId: data.id,
    userId,
    agentId,
    clientId,
    clientRequestId,
    startTime,
    model: data.model,
    reasoningText: state.reasoningText,
    response: state.responseText,
    cost,
    credits: Math.round(cost * 100 * (1 + PROFIT_MARGIN)),
    inputTokens: usage.prompt_tokens,
    cacheCreationInputTokens: null,
    cacheReadInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
    outputTokens: usage.completion_tokens,
    logger,
  })

  return state
}

async function handleStreamChunk({
  data,
  state,
}: {
  data: OpenRouterStreamChatCompletionChunk
  state: StreamState
}): Promise<StreamState> {
  if ('error' in data) {
    logger.warn({ streamChunk: data }, 'Received error from OpenRouter')
    return state
  }

  if (!data.choices.length) {
    logger.warn({ streamChunk: data }, 'Received empty choices from OpenRouter')
  }
  const choice = data.choices[0]
  state.responseText += choice.delta?.content ?? ''
  state.reasoningText += choice.delta?.reasoning ?? ''
  return state
}
