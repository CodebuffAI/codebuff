import { afterEach, describe, expect, test } from 'bun:test'

import { promptAiSdkStream } from '../llm'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  trace() {},
  child() {
    return this
  },
}

describe('stream prompt repair', () => {
  test('repairs interrupted tool history before AI SDK validates it', async () => {
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({
            id: 'chatcmpl-repaired',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'test-model',
            choices: [
              {
                index: 0,
                delta: { content: 'recovered' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
            },
          })}\n\ndata: [DONE]\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      )
    }) as unknown as typeof fetch

    const stream = promptAiSdkStream({
      apiKey: 'test-key',
      runId: 'run-repaired',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'start' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'yrU85adS7ks',
              toolName: 'read_files',
              input: { paths: ['README.md'] },
            },
          ],
        },
        { role: 'user', content: [{ type: 'text', text: 'continue' }] },
        {
          role: 'tool',
          toolCallId: 'yrU85adS7ks',
          toolName: 'read_files',
          content: [{ type: 'json', value: { files: [] } }],
        },
      ],
      clientSessionId: 'session-repaired',
      fingerprintId: 'fingerprint-repaired',
      model: 'openai/gpt-5.6-luna',
      userId: 'user-1',
      userInputId: 'input-repaired',
      sendAction: async () => undefined,
      logger,
      trackEvent: async () => undefined,
      signal: new AbortController().signal,
    } as unknown as Parameters<typeof promptAiSdkStream>[0])

    const text: string[] = []
    for await (const chunk of stream) {
      if (chunk.type === 'text') text.push(chunk.text)
    }

    expect(text.join('')).toBe('recovered')
    const wireMessages = requestBody?.messages as
      | Array<Record<string, unknown>>
      | undefined
    expect(
      wireMessages?.some(
        (message) =>
          message.role === 'assistant' &&
          JSON.stringify(message).includes('yrU85adS7ks'),
      ),
    ).toBe(false)
  })

  // A screenshot's image rides a user message, and the AI SDK rejects a user
  // message while a sibling call from the same batch is still unanswered. That
  // throws in convertToLanguageModelPrompt before any request goes out, so it
  // cannot be repaired server-side -- assert the call actually reaches the wire.
  test('sends a batch whose first parallel call returned an image', async () => {
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({
            id: 'chatcmpl-media',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'test-model',
            choices: [
              { index: 0, delta: { content: 'saw it' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })}\n\ndata: [DONE]\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      )
    }) as unknown as typeof fetch

    const stream = promptAiSdkStream({
      apiKey: 'test-key',
      runId: 'run-media',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'shoot and read' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'shot-1',
              toolName: 'preview_screenshot',
              input: {},
            },
            {
              type: 'tool-call',
              toolCallId: 'read-1',
              toolName: 'read_files',
              input: { paths: ['README.md'] },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'shot-1',
          toolName: 'preview_screenshot',
          content: [
            { type: 'media', data: 'QUJD', mediaType: 'image/png' },
            { type: 'json', value: { ok: true } },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'read-1',
          toolName: 'read_files',
          content: [{ type: 'json', value: { files: [] } }],
        },
      ],
      clientSessionId: 'session-media',
      fingerprintId: 'fingerprint-media',
      model: 'openai/gpt-5.6-luna',
      userId: 'user-1',
      userInputId: 'input-media',
      sendAction: async () => undefined,
      logger,
      trackEvent: async () => undefined,
      signal: new AbortController().signal,
    } as unknown as Parameters<typeof promptAiSdkStream>[0])

    const text: string[] = []
    for await (const chunk of stream) {
      if (chunk.type === 'text') text.push(chunk.text)
    }

    // Reached the provider at all: without the reordering this rejects locally.
    expect(text.join('')).toBe('saw it')
    const wireMessages = requestBody?.messages as
      | Array<Record<string, unknown>>
      | undefined
    // Both calls are still answered, and the image survives the move.
    const serialized = JSON.stringify(wireMessages)
    expect(serialized).toContain('shot-1')
    expect(serialized).toContain('read-1')
    expect(serialized).toContain('QUJD')
  })
})
