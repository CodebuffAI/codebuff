import { describe, expect, it } from 'bun:test';

import { OpenAICompatibleCompletionLanguageModel } from './openai-compatible-completion-language-model';

import type {
  LanguageModelV2,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';

function createModel(fetch: FetchFunction) {
  return new OpenAICompatibleCompletionLanguageModel('test-model', {
    provider: 'agent-platform.completion',
    headers: () => ({}),
    url: () => 'https://example.test/completions',
    fetch,
  });
}

async function collectStreamChunks(
  chunksToSend: unknown[],
): Promise<LanguageModelV2StreamPart[]> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunksToSend) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  const fetch = (async () =>
    new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })) as unknown as FetchFunction;
  const model = createModel(fetch);

  const result = await model.doStream({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Write' }] }],
  } as Parameters<LanguageModelV2['doStream']>[0]);
  const chunks: LanguageModelV2StreamPart[] = [];
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }
  return chunks;
}

describe('OpenAICompatibleCompletionLanguageModel billing telemetry streaming', () => {
  it('ignores billing.summary telemetry before the first completion chunk', async () => {
    const chunks = await collectStreamChunks([
      {
        object: 'billing.summary',
        billing: { total_cost: 0.001 },
      },
      {
        id: 'cmpl-test',
        created: 1,
        model: 'test-model',
        choices: [
          {
            text: 'Hello',
            finish_reason: null,
            index: 0,
          },
        ],
      },
      {
        id: 'cmpl-test',
        created: 1,
        model: 'test-model',
        choices: [
          {
            text: '',
            finish_reason: 'stop',
            index: 0,
          },
        ],
      },
    ]);

    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(false);
    expect(chunks).toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'response-metadata',
        id: 'cmpl-test',
        modelId: 'test-model',
        timestamp: new Date(1000),
      },
      { type: 'text-start', id: '0' },
      { type: 'text-delta', id: '0', delta: 'Hello' },
      { type: 'text-delta', id: '0', delta: '' },
      { type: 'text-end', id: '0' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: {
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
        },
      },
    ]);
  });

  it('ignores billing.summary telemetry without changing finish state', async () => {
    const chunks = await collectStreamChunks([
      {
        id: 'cmpl-test',
        created: 1,
        model: 'test-model',
        choices: [
          {
            text: 'Hello',
            finish_reason: null,
            index: 0,
          },
        ],
      },
      {
        object: 'billing.summary',
        billing: { total_cost: 0.001 },
      },
      {
        id: 'cmpl-test',
        created: 1,
        model: 'test-model',
        choices: [
          {
            text: '',
            finish_reason: 'stop',
            index: 0,
          },
        ],
      },
    ]);

    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(false);
    expect(chunks).toContainEqual({
      type: 'text-delta',
      id: '0',
      delta: 'Hello',
    });
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'finish',
        finishReason: 'stop',
      }),
    );
  });
});
