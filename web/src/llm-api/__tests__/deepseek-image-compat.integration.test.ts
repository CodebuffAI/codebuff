import { describe, expect, it, mock } from 'bun:test'

import {
  createDeepSeekRequest,
  normalizeDeepSeekRequestBody,
} from '../deepseek'

import type { ChatCompletionRequestBody } from '../types'

describe('normalizeDeepSeekRequestBody', () => {
  it('converts multimodal user content into DeepSeek text content without mutating input', () => {
    const body: ChatCompletionRequestBody = {
      model: 'deepseek/deepseek-v4-pro',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,AAECAw==' },
            },
          ],
        },
      ],
    }

    const normalized = normalizeDeepSeekRequestBody(body)

    expect(normalized.messages[0].content).toBe(
      'What is in this image?\n\n[1 image was omitted because the DeepSeek API does not support image input.]',
    )
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'What is in this image?' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,AAECAw==' },
      },
    ])
  })

  it('keeps text-only messages unchanged', () => {
    const body: ChatCompletionRequestBody = {
      model: 'deepseek/deepseek-v4-pro',
      messages: [{ role: 'user', content: 'Hello' }],
    }

    expect(normalizeDeepSeekRequestBody(body)).toEqual({
      ...body,
      model: 'deepseek-v4-pro',
    })
  })
})

describe('createDeepSeekRequest', () => {
  it('sends DeepSeek-compatible text content when the request contains an image attachment', async () => {
    let sentBody: Record<string, unknown> | null = null
    const mockFetch = mock(
      async (_url: string | URL | Request, init?: RequestInit) => {
        sentBody = JSON.parse(init?.body as string)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      },
    ) as unknown as typeof globalThis.fetch

    const body: ChatCompletionRequestBody = {
      model: 'deepseek/deepseek-v4-pro',
      messages: [
        { role: 'system', content: 'You are a coding assistant.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Please inspect this screenshot.' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' },
            },
          ],
        },
      ],
      stream: true,
      reasoning: { enabled: true, effort: 'medium' },
      provider: { order: ['DeepSeek'] },
      transforms: ['middle-out'],
      codebuff_metadata: { run_id: 'run-1', cost_mode: 'free' },
      usage: { include: true },
    }

    await createDeepSeekRequest({
      body,
      originalModel: body.model,
      fetch: mockFetch,
    })

    expect(sentBody).toMatchObject({
      model: 'deepseek-v4-pro',
      stream: true,
      stream_options: { include_usage: true },
      thinking: { type: 'enabled', reasoning_effort: 'high' },
    })
    expect(sentBody).not.toHaveProperty('reasoning')
    expect(sentBody).not.toHaveProperty('provider')
    expect(sentBody).not.toHaveProperty('transforms')
    expect(sentBody).not.toHaveProperty('codebuff_metadata')
    expect(sentBody).not.toHaveProperty('usage')

    const capturedBody = sentBody as unknown as Record<string, unknown>
    const messages = capturedBody.messages as Array<{ content: string }>
    expect(messages[1].content).toBe(
      'Please inspect this screenshot.\n\n[1 image was omitted because the DeepSeek API does not support image input.]',
    )
    expect(JSON.stringify(sentBody)).not.toContain('image_url')
    expect(JSON.stringify(body)).toContain('image_url')
  })
})
