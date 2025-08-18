import { createTestServer } from '@ai-sdk/provider-utils/test'
import { describe, expect, it } from 'bun:test'

import { OpenRouterChatLanguageModel } from '../chat'

import type { OpenRouterChatSettings } from '../types/openrouter-chat-settings'

describe('OpenRouter Usage Accounting', () => {
  const server = createTestServer({
    'https://api.openrouter.ai/chat/completions': {
      response: { type: 'json-value', body: {} },
    },
  })

  function prepareJsonResponse(includeUsage = true) {
    const response = {
      id: 'test-id',
      model: 'test-model',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Hello, I am an AI assistant.',
          },
          index: 0,
          finish_reason: 'stop',
        },
      ],
      usage: includeUsage
        ? {
            prompt_tokens: 10,
            prompt_tokens_details: {
              cached_tokens: 5,
            },
            completion_tokens: 20,
            completion_tokens_details: {
              reasoning_tokens: 8,
            },
            total_tokens: 30,
            cost: 0.0015,
            cost_details: {
              upstream_inference_cost: 19,
            },
          }
        : undefined,
    }

    server.urls['https://api.openrouter.ai/chat/completions']!.response = {
      type: 'json-value',
      body: response,
    }
  }

  it('should include usage parameter in the request when enabled', async () => {
    prepareJsonResponse()

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

    // Call the model
    await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
      maxOutputTokens: 100,
    })

    // Check request contains usage parameter
    const requestBody = await server.calls[0]!.requestBodyJson
    expect(requestBody).toBeDefined()
    expect(requestBody).toHaveProperty('usage')
    expect(requestBody.usage).toEqual({ include: true })
  })

  it('should include provider-specific metadata in response when usage accounting is enabled', async () => {
    prepareJsonResponse()

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

    // Call the model
    const result = await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
      maxOutputTokens: 100,
    })

    // Check result contains provider metadata
    expect(result.providerMetadata).toBeDefined()
    const providerData = result.providerMetadata

    // Check for OpenRouter usage data
    expect(providerData?.openrouter).toBeDefined()
    const openrouterData = providerData?.openrouter as Record<string, unknown>
    expect(openrouterData.usage).toBeDefined()

    const usage = openrouterData.usage
    expect(usage).toMatchObject({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      cost: 0.0015,
      promptTokensDetails: {
        cachedTokens: 5,
      },
      completionTokensDetails: {
        reasoningTokens: 8,
      },
    })
  })

  it('should not include provider-specific metadata when usage accounting is disabled', async () => {
    prepareJsonResponse()

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

    // Call the model
    const result = await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
      maxOutputTokens: 100,
    })

    // Verify that OpenRouter metadata is not included
    expect(result.providerMetadata?.openrouter?.usage).toStrictEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      cost: 0.0015,
      costDetails: {
        upstreamInferenceCost: 19,
      },
      promptTokensDetails: {
        cachedTokens: 5,
      },
      completionTokensDetails: {
        reasoningTokens: 8,
      },
    })
  })
})
