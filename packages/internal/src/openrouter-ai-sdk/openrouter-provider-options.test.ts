import { createTestServer } from '@ai-sdk/provider-utils/test'
import { streamText } from 'ai'
import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { createOpenRouter } from './openrouter-provider'

import type { LanguageModelV1Prompt } from '@ai-sdk/provider'

// Add type assertions for the mocked classes
const TEST_MESSAGES: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
]

describe('providerOptions', () => {
  const server = createTestServer({
    'https://openrouter.ai/api/v1/chat/completions': {
      response: {
        type: 'stream-chunks',
        chunks: [],
      },
    },
  })

  beforeEach(() => {
    mock.restore()
  })

  it('should set providerOptions openrouter to extra body', async () => {
    const openrouter = createOpenRouter({
      apiKey: 'test',
    })
    const model = openrouter('anthropic/claude-3.7-sonnet')

    await streamText({
      model,
      messages: TEST_MESSAGES,
      providerOptions: {
        openrouter: {
          reasoning: {
            max_tokens: 1000,
          },
        },
      },
    }).consumeStream()

    expect(await server.calls[0]?.requestBody).toStrictEqual({
      messages: [
        {
          content: 'Hello',
          role: 'user',
        },
      ],
      reasoning: {
        max_tokens: 1000,
      },
      temperature: 0,
      model: 'anthropic/claude-3.7-sonnet',
      stream: true,
    })
  })
})
