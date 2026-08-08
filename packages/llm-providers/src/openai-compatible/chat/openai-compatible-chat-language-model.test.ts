import { describe, expect, it } from 'bun:test'

import { OpenAICompatibleChatLanguageModel } from './openai-compatible-chat-language-model'

import type { LanguageModelV2StreamPart } from '@ai-sdk/provider'

/**
 * Simulates the server side of an SSE completion stream. `close` decides
 * whether the body ends like a healthy stream (finish_reason + usage +
 * [DONE]) or is cut mid-response the way a killed server instance or dropped
 * connection looks to the client: the HTTP body just ends after some deltas.
 */
function sseResponse(lines: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`))
      }
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function chunk(delta: object, extra: object = {}): string {
  return JSON.stringify({
    id: 'cmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'test-model',
    choices: [{ index: 0, delta, ...extra }],
  })
}

async function streamParts(response: Response) {
  // Bun's fetch type carries a `preconnect` member the mock doesn't need.
  const testFetch = (async () => response) as unknown as typeof fetch
  const model = new OpenAICompatibleChatLanguageModel('test-model', {
    provider: 'test-provider',
    headers: () => ({}),
    url: () => 'https://example.test/v1/chat/completions',
    fetch: testFetch,
  })

  const { stream } = await model.doStream({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    includeRawChunks: false,
  })

  const parts: LanguageModelV2StreamPart[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
  }
  return parts
}

const finishPartOf = (parts: LanguageModelV2StreamPart[]) => {
  const finish = parts.find((part) => part.type === 'finish')
  if (!finish || finish.type !== 'finish') {
    throw new Error('stream emitted no finish part')
  }
  return finish
}

describe('OpenAICompatibleChatLanguageModel doStream', () => {
  it('a healthy stream finishes with a real reason and usage', async () => {
    const parts = await streamParts(
      sseResponse([
        chunk({ role: 'assistant', content: 'Hello' }),
        chunk({ content: ' world' }),
        JSON.stringify({
          id: 'cmpl-1',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'test-model',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        }),
        '[DONE]',
      ]),
    )

    const finish = finishPartOf(parts)
    expect(finish.finishReason).toBe('stop')
    expect(finish.usage.totalTokens).toBe(5)
  })

  it('a connection cut mid-stream flushes finishReason unknown with no usage', async () => {
    // No finish_reason chunk, no usage, no [DONE] — the body just ends, which
    // is exactly what a client sees when the serving instance dies mid-stream.
    // This is the invariant the SDK's stream-interruption detection relies on
    // (sdk/src/impl/stream-interruption.ts): finishReason 'unknown' AND
    // missing usage after stream end means the tail was never received.
    const parts = await streamParts(
      sseResponse([
        chunk({ role: 'assistant', content: 'The reviewer flagged two ' }),
        chunk({ content: 'unused React default imports (' }),
      ]),
    )

    // Text that did arrive is preserved...
    const text = parts
      .filter((part) => part.type === 'text-delta')
      .map((part) => (part.type === 'text-delta' ? part.delta : ''))
      .join('')
    expect(text).toBe('The reviewer flagged two unused React default imports (')

    // ...but the synthesized finish carries the truncation signature.
    const finish = finishPartOf(parts)
    expect(finish.finishReason).toBe('unknown')
    expect(finish.usage.inputTokens ?? undefined).toBeUndefined()
    expect(finish.usage.outputTokens ?? undefined).toBeUndefined()
    expect(finish.usage.totalTokens ?? undefined).toBeUndefined()
  })

  it('assembles streamed reasoning_details onto the reasoning-end part', async () => {
    const parts = await streamParts(
      sseResponse([
        chunk({
          role: 'assistant',
          reasoning: 'Think',
          reasoning_details: [
            { type: 'reasoning.text', text: 'Think', index: 0 },
          ],
        }),
        chunk({
          reasoning: 'ing.',
          reasoning_details: [
            {
              type: 'reasoning.text',
              text: 'ing.',
              index: 0,
              signature: 'sig-1',
              format: 'anthropic-claude-v1',
            },
          ],
        }),
        chunk({ content: 'Done.' }),
        JSON.stringify({
          id: 'cmpl-1',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'test-model',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        }),
        '[DONE]',
      ]),
    )

    const reasoningEnd = parts.find((part) => part.type === 'reasoning-end')
    if (!reasoningEnd || reasoningEnd.type !== 'reasoning-end') {
      throw new Error('stream emitted no reasoning-end part')
    }
    expect(reasoningEnd.providerMetadata).toEqual({
      'test-provider': {
        reasoning_details: [
          {
            type: 'reasoning.text',
            text: 'Thinking.',
            index: 0,
            signature: 'sig-1',
            format: 'anthropic-claude-v1',
          },
        ],
        model: 'test-model',
      },
    })
  })
})
