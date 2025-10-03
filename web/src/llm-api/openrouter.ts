import {
  insertMessage as insertMessageIntoBigquery,
  setupBigQuery,
} from '@codebuff/bigquery'
import { env } from '@codebuff/internal/env'

import { OpenRouterStreamChatCompletionChunkSchema } from './type/openrouter'

import type { OpenRouterStreamChatCompletionChunk } from './type/openrouter'

import { errorToObject } from '@/util/error'
import { logger } from '@/util/logger'

type StreamState = { responseText: string }

export async function handleOpenRouterStream({
  body,
  userId,
}: {
  body: any
  userId: string
}) {
  // Ensure usage tracking is enabled
  if (body.usage === undefined) {
    body.usage = {}
  }
  body.usage.include = true

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
  let state: StreamState = { responseText: '' }

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
        controller.enqueue(
          new TextEncoder().encode(
            `: heartbeat ${new Date().toISOString()}\n\n`
          )
        )
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

            state = await handleLine({ userId, request: body, line, state })

            // Forward the line to the client
            controller.enqueue(new TextEncoder().encode(line))

            lineEnd = buffer.indexOf('\n')
          }
        }

        controller.close()
      } catch (error) {
        controller.error(error)
      } finally {
        clearInterval(heartbeatInterval)
        reader.cancel()
      }
    },
    cancel() {
      clearInterval(heartbeatInterval)
      reader.cancel()
    },
  })

  return stream
}

async function handleLine({
  userId,
  request,
  line,
  state,
}: {
  userId: string
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
      `Received non-JSON OpenRouter response: ${JSON.stringify(errorToObject(error), null, 2)}`
    )
    return state
  }

  // Extract usage
  const parsed = OpenRouterStreamChatCompletionChunkSchema.safeParse(obj)
  if (!parsed.success) {
    logger.warn(
      `Unable to parse OpenRotuer response: ${JSON.stringify(errorToObject(parsed.error), null, 2)}`
    )
    return state
  }

  return await handleResponse({ userId, request, data: parsed.data, state })
}

async function handleResponse({
  userId,
  request,
  data,
  state,
}: {
  userId: string
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
  setupBigQuery().then(() =>
    insertMessageIntoBigquery({
      id: data.id,
      user_id: userId,
      finished_at: new Date(),
      created_at: new Date(data.created * 1000),
      request,
      response: state.responseText,
      output_tokens: usage.completion_tokens,
      reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens,
      cost: usage.cost,
      upstream_inference_cost: usage.cost_details?.upstream_inference_cost,
      input_tokens: usage.prompt_tokens,
      cache_read_input_tokens: usage.prompt_tokens_details?.cached_tokens,
    })
  )
  const openRouterCost = usage.cost ?? 0
  const upstreamCost = usage.cost_details?.upstream_inference_cost ?? 0
  const cost = openRouterCost + upstreamCost
  // asdf todo: charge user
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
  return state
}
