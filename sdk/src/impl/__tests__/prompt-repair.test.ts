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
})
