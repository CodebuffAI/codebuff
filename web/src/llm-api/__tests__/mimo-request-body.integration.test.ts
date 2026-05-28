import { describe, expect, it } from 'bun:test'

import {
  buildMiMoRequestBody,
  normalizeMiMoRequestBody,
} from '../mimo-request-body'

import type { ChatCompletionRequestBody } from '../types'

describe('normalizeMiMoRequestBody', () => {
  it('maps the Codebuff MiMo model id to the Xiaomi API model id', () => {
    const body: ChatCompletionRequestBody = {
      model: 'mimo/mimo-v2.5-pro',
      messages: [{ role: 'user', content: 'Hello' }],
    }

    expect(normalizeMiMoRequestBody(body)).toEqual({
      ...body,
      model: 'mimo-v2.5-pro',
    })
  })

  it('maps the non-pro MiMo model id to the Xiaomi API model id', () => {
    const body: ChatCompletionRequestBody = {
      model: 'mimo/mimo-v2.5',
      messages: [{ role: 'user', content: 'Hello' }],
    }

    expect(normalizeMiMoRequestBody(body)).toEqual({
      ...body,
      model: 'mimo-v2.5',
    })
  })

  it('converts unsupported attachment parts into text notices', () => {
    const body: ChatCompletionRequestBody = {
      model: 'mimo/mimo-v2.5-pro',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this image.' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,AAECAw==' },
            },
          ],
        },
      ],
    }

    const normalized = normalizeMiMoRequestBody(body)

    expect(normalized.messages[0].content).toBe(
      'Summarize this image.\n\n[1 image was omitted because the MiMo API does not support image input.]',
    )
    expect(JSON.stringify(body)).toContain('image_url')
  })
})

describe('buildMiMoRequestBody', () => {
  it('builds Xiaomi-compatible JSON and strips OpenRouter/internal fields', () => {
    const body: ChatCompletionRequestBody = {
      model: 'mimo/mimo-v2.5-pro',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true,
      max_tokens: 123,
      reasoning: { enabled: false, effort: 'medium' },
      provider: { order: ['MiMo'] },
      transforms: ['middle-out'],
      codebuff_metadata: { run_id: 'run-1' },
      usage: { include: true },
    }

    const sentBody = buildMiMoRequestBody(body, body.model)

    expect(sentBody).toMatchObject({
      model: 'mimo-v2.5-pro',
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: 123,
      thinking: { type: 'disabled', reasoning_effort: 'high' },
    })
    expect(sentBody).not.toHaveProperty('max_tokens')
    expect(sentBody).not.toHaveProperty('reasoning')
    expect(sentBody).not.toHaveProperty('provider')
    expect(sentBody).not.toHaveProperty('transforms')
    expect(sentBody).not.toHaveProperty('codebuff_metadata')
    expect(sentBody).not.toHaveProperty('usage')
  })
})
