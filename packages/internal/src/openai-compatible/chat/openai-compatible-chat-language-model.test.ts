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

describe('OpenAICompatibleChatLanguageModel malformed tool-call streaming', () => {
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
      })
    ) as unknown as FetchFunction;
    const model = createModel(fetch);

    const result = await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Edit' }] }],
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
    return chunks;
  }

  // Reproduces the Bedrock-proxy bug: a single logical tool call whose JSON
  // arguments are streamed truncated (missing the closing brace) in the first
  // delta, with the orphaned suffix re-emitted as a SECOND tool_calls entry
  // that has a shifted index and an EMPTY ("") function name. Previously this
  // produced two broken halves (a truncated real call + a phantom empty-named
  // call -> "Tool '' not found"). The fix merges the empty-named continuation
  // back into the real call.
  it('merges an empty-name continuation delta into the open tool call', async () => {
    const args = '{"path":"notes.ts","replacements":[{"oldString":"a","newString":"b"}]}';
    const splitAt = args.length - 1; // everything except the final '}'
    const head = args.slice(0, splitAt);
    const tail = args.slice(splitAt); // '}'

    const chunks = await collectStreamChunks([
      {
        id: 'chatcmpl-test',
        model: 'test-model',
        choices: [
          {
            delta: {
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id: 'chatcmpl-tool-1',
                  type: 'function',
                  function: { name: 'propose_str_replace', arguments: head },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-test',
        model: 'test-model',
        choices: [
          {
            delta: {
              // Protocol-violating continuation: new index, empty name.
              tool_calls: [
                {
                  index: 1,
                  id: '',
                  type: 'function',
                  function: { name: '', arguments: tail },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
    ]);

    const toolCalls = chunks.filter((c) => c.type === 'tool-call');
    // Exactly one well-formed tool call, no phantom empty-named call.
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({
      type: 'tool-call',
      toolName: 'propose_str_replace',
      toolCallId: 'chatcmpl-tool-1',
      input: args,
    });
    expect(
      chunks.some(
        (c) => c.type === 'tool-call' && (c as any).toolName === '',
      ),
    ).toBe(false);
  });

  // A stray empty-name fragment with no open tool call to attach to should be
  // dropped rather than throwing or creating a phantom call.
  it('drops a stray empty-name fragment when no tool call is open', async () => {
    const chunks = await collectStreamChunks([
      {
        id: 'chatcmpl-test',
        model: 'test-model',
        choices: [
          {
            delta: {
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id: '',
                  type: 'function',
                  function: { name: '', arguments: '}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
    ]);

    const toolCalls = chunks.filter((c) => c.type === 'tool-call');
    expect(toolCalls).toHaveLength(0);
  });
});
