import { describe, expect, it } from 'bun:test';

import { OpenAICompatibleChatLanguageModel } from './openai-compatible-chat-language-model';

import type { LanguageModelV2StreamPart } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';

function createModel(fetch: FetchFunction) {
  return new OpenAICompatibleChatLanguageModel('test-model', {
    provider: 'agent-platform.chat',
    headers: () => ({}),
    url: () => 'https://example.test/chat/completions',
    fetch,
  });
}

const toolCallMetadata = {
  openaiCompatible: {
    extra_content: {
      google: {
        thought_signature: 'thought-signature-123',
      },
    },
  },
};

describe('OpenAICompatibleChatLanguageModel tool-call metadata', () => {
  it('preserves extra tool-call fields in non-streaming responses', async () => {
    const fetch = (async () =>
      new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          model: 'test-model',
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: {
                      name: 'read_docs',
                      arguments: '{"topic":"auth"}',
                    },
                    extra_content: {
                      google: {
                        thought_signature: 'thought-signature-123',
                      },
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    ) as unknown as FetchFunction;
    const model = createModel(fetch);

    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Use docs' }] }],
    } as any);

    expect(result.content).toContainEqual({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'read_docs',
      input: '{"topic":"auth"}',
      providerMetadata: toolCallMetadata,
    });
  });

  it('preserves extra tool-call fields in streaming responses', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: ',
              JSON.stringify({
                id: 'chatcmpl-test',
                model: 'test-model',
                choices: [
                  {
                    delta: {
                      role: 'assistant',
                      tool_calls: [
                        {
                          index: 0,
                          id: 'call-1',
                          type: 'function',
                          function: {
                            name: 'read_docs',
                            arguments: '{"topic":"auth"}',
                          },
                          extra_content: {
                            google: {
                              thought_signature: 'thought-signature-123',
                            },
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              }),
              '\n\n',
              'data: [DONE]\n\n',
            ].join(''),
          ),
        );
        controller.close();
      },
    });
    const fetch = (async () =>
      new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    ) as unknown as FetchFunction;
    const model = createModel(fetch);

    const result = await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Use docs' }] }],
    } as any);
    const chunks: LanguageModelV2StreamPart[] = [];
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
    }

    expect(chunks).toContainEqual({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'read_docs',
      input: '{"topic":"auth"}',
      providerMetadata: toolCallMetadata,
    });
  });
});
