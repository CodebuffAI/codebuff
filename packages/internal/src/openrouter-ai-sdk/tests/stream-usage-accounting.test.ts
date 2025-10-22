import {
  convertReadableStreamToArray,
  createTestServer,
} from '@ai-sdk/provider-utils/test'
import { describe, expect, it } from 'bun:test'

import { OpenRouterChatLanguageModel } from '../chat'

import type { OpenRouterChatSettings } from '../types/openrouter-chat-settings'

describe('OpenRouter Streaming Usage Accounting', () => {
  const server = createTestServer({
    'https://api.openrouter.ai/chat/completions': {
      response: { type: 'stream-chunks', chunks: [] },
    },
  })

  function prepareStreamResponse(includeUsage = true) {
    const chunks = [
      `data: {"id":"test-id","model":"test-model","choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n`,
      `data: {"choices":[{"finish_reason":"stop","index":0}]}\n\n`,
    ]

    if (includeUsage) {
      chunks.push(
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

    chunks.push('data: [DONE]\n\n')

    server.urls['https://api.openrouter.ai/chat/completions']!.response = {
      type: 'stream-chunks',
      chunks,
    }
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
    const requestBody = await server.calls[0]!.requestBodyJson
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
