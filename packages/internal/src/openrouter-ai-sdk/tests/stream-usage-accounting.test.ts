import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { OpenRouterChatLanguageModel } from '../chat'

import type { OpenRouterChatSettings } from '../types/openrouter-chat-settings'

describe('OpenRouter Streaming Usage Accounting', () => {
  const originalFetch = global.fetch
  let capturedRequests: Array<{
    url: string
    body?: any
  }> = []
  let nextResponseChunks: string[] = []

  const createStreamFromChunks = (chunks: string[]) =>
    new ReadableStream<string>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
    }).pipeThrough(new TextEncoderStream())

  beforeEach(() => {
    capturedRequests = []
    global.fetch = (async (input: RequestInfo, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      let parsedBody: any
      if (init?.body && typeof init.body === 'string') {
        try {
          parsedBody = JSON.parse(init.body)
        } catch {
          parsedBody = undefined
        }
      }

      capturedRequests.push({ url, body: parsedBody })

      return new Response(createStreamFromChunks(nextResponseChunks), {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }) as typeof global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    nextResponseChunks = []
  })

  function prepareStreamResponse(includeUsage = true) {
    nextResponseChunks = [
      `data: {"id":"test-id","model":"test-model","choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n`,
      `data: {"choices":[{"finish_reason":"stop","index":0}]}\n\n`,
    ]

    if (includeUsage) {
      nextResponseChunks.push(
        `data: ${JSON.stringify({
          usage: {
            prompt_tokens: 10,
            prompt_tokens_details: { cached_tokens: 5 },
            completion_tokens: 20,
            completion_tokens_details: { reasoning_tokens: 8 },
            total_tokens: 30,
            cost: 0.0015,
            cost_details: {
              upstream_inference_cost: 19,
            },
          },
          choices: [],
        })}\n\n`,
      )
    }

    nextResponseChunks.push('data: [DONE]\n\n')
  }

  it('should include stream_options.include_usage in request when enabled', async () => {
    prepareStreamResponse()

    // Create model with usage accounting enabled
    const settings: OpenRouterChatSettings = {
      usage: { include: true },
    }

    const model = new OpenRouterChatLanguageModel('test-model', settings, {
      provider: 'openrouter.chat',
      url: () => 'https://api.openrouter.ai/chat/completions',
      headers: () => ({}),
      compatibility: 'strict',
      fetch: global.fetch,
    })

    // Call the model with streaming
    await model.doStream({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
      maxOutputTokens: 100,
    })

    // Verify stream options
    const requestBody = capturedRequests[0]?.body
    expect(requestBody).toBeDefined()
    expect(requestBody.stream).toBe(true)
    expect(requestBody.stream_options).toEqual({
      include_usage: true,
    })
  })

  it('should include provider-specific metadata in finish event when usage accounting is enabled', async () => {
    prepareStreamResponse(true)

    // Create model with usage accounting enabled
    const settings: OpenRouterChatSettings = {
      usage: { include: true },
    }

    const model = new OpenRouterChatLanguageModel('test-model', settings, {
      provider: 'openrouter.chat',
      url: () => 'https://api.openrouter.ai/chat/completions',
      headers: () => ({}),
      compatibility: 'strict',
      fetch: global.fetch,
    })

    // Call the model with streaming
    const result = await model.doStream({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
      maxOutputTokens: 100,
    })

    // Read all chunks from the stream
    const chunks = await convertReadableStreamToArray(result.stream)

    // Find the finish chunk
    const finishChunk = chunks.find((chunk) => chunk.type === 'finish')
    expect(finishChunk).toBeDefined()

    // Verify metadata is included
    expect(finishChunk?.providerMetadata).toBeDefined()
    const openrouterData = finishChunk?.providerMetadata?.openrouter
    expect(openrouterData).toBeDefined()

    const usage = openrouterData?.usage
    expect(usage).toMatchObject({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      cost: 0.0015,
      costDetails: {
        upstreamInferenceCost: 19,
      },
      promptTokensDetails: { cachedTokens: 5 },
      completionTokensDetails: { reasoningTokens: 8 },
    })
  })

  it('should not include provider-specific metadata when usage accounting is disabled', async () => {
    prepareStreamResponse(false)

    // Create model with usage accounting disabled
    const settings: OpenRouterChatSettings = {
      // No usage property
    }

    const model = new OpenRouterChatLanguageModel('test-model', settings, {
      provider: 'openrouter.chat',
      url: () => 'https://api.openrouter.ai/chat/completions',
      headers: () => ({}),
      compatibility: 'strict',
      fetch: global.fetch,
    })

    // Call the model with streaming
    const result = await model.doStream({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
      maxOutputTokens: 100,
    })

    // Read all chunks from the stream
    const chunks = await convertReadableStreamToArray(result.stream)

    // Find the finish chunk
    const finishChunk = chunks.find((chunk) => chunk.type === 'finish')
    expect(finishChunk).toBeDefined()

    // Verify that provider metadata is not included
    expect(finishChunk?.providerMetadata?.openrouter).toStrictEqual({
      usage: {},
    })
  })
})
