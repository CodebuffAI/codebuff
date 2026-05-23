import { describe, expect, test } from 'bun:test'

import { transformChatGptBackendRequestBody } from '../impl/chatgpt-backend-fetch'

describe('chatgpt backend fetch transform', () => {
  test('defaults GPT/Codex reasoning effort to low for interactive agent tool loops', () => {
    const transformed = transformChatGptBackendRequestBody({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(transformed.reasoning).toEqual({ effort: 'low' })
  })

  test('preserves explicit reasoning effort from openai-compatible provider options', () => {
    const transformed = transformChatGptBackendRequestBody({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      reasoning_effort: 'high',
    })

    expect(transformed.reasoning).toEqual({ effort: 'high' })
  })
})
