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

  it('preserves image parts for MiMo vision requests without mutating input', () => {
    const body: ChatCompletionRequestBody = {
      model: 'mimo/mimo-v2.5',
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

    expect(normalized.messages[0].content).toEqual([
      { type: 'text', text: 'Summarize this image.' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,AAECAw==' },
      },
    ])
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'Summarize this image.' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,AAECAw==' },
      },
    ])
  })

  it('strips images for MiMo 2.5 Pro and leaves a note instead of failing', () => {
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
  })

  it('converts unsupported non-image attachment parts into text notices', () => {
    const body: ChatCompletionRequestBody = {
      model: 'mimo/mimo-v2.5',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this file.' },
            {
              type: 'file',
              file: { filename: 'notes.txt', file_data: 'Zm9v' },
            },
          ],
        },
      ],
    }

    const normalized = normalizeMiMoRequestBody(body)

    expect(normalized.messages[0].content).toBe(
      'Summarize this file.\n\n[1 file was omitted because the MiMo API does not support file input.]',
    )
  })
})

describe('buildMiMoRequestBody', () => {
  it('builds Xiaomi-compatible JSON with image content and strips OpenRouter/internal fields', () => {
    const body: ChatCompletionRequestBody = {
      model: 'mimo/mimo-v2.5',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this screenshot.' },
            {
              type: 'image_url',
              image_url: 'https://example.com/screenshot.png',
            },
          ],
        },
      ],
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
      model: 'mimo-v2.5',
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: 123,
      thinking: { type: 'disabled', reasoning_effort: 'high' },
    })
    expect(sentBody.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this screenshot.' },
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/screenshot.png' },
          },
        ],
      },
    ])
    expect(sentBody).not.toHaveProperty('max_tokens')
    expect(sentBody).not.toHaveProperty('reasoning')
    expect(sentBody).not.toHaveProperty('provider')
    expect(sentBody).not.toHaveProperty('transforms')
    expect(sentBody).not.toHaveProperty('codebuff_metadata')
    expect(sentBody).not.toHaveProperty('usage')
  })
})
