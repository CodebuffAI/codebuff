import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test'
import { beforeEach, describe, expect, it } from 'bun:test'

import { createOpenRouter } from '../provider'

import type { LanguageModelV2Prompt } from '@ai-sdk/provider'

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
]

const TEST_LOGPROBS = {
  tokens: [' ever', ' after', '.\n\n', 'The', ' end', '.'],
  token_logprobs: [
    -0.0664508, -0.014520033, -1.3820221, -0.7890417, -0.5323165, -0.10247037,
  ],
  top_logprobs: [
    {
      ' ever': -0.0664508,
    },
    {
      ' after': -0.014520033,
    },
    {
      '.\n\n': -1.3820221,
    },
    {
      The: -0.7890417,
    },
    {
      ' end': -0.5323165,
    },
    {
      '.': -0.10247037,
    },
  ] as Record<string, number>[],
}

type MockResponseDefinition =
  | {
      type: 'json-value'
      body: any
      headers?: Record<string, string>
      status?: number
    }
  | {
      type: 'stream-chunks'
      chunks: string[]
      headers?: Record<string, string>
      status?: number
    }

type MockServerRoute = {
  response: MockResponseDefinition
}

type MockServerCall = {
  requestHeaders: Record<string, string>
  requestBodyJson: Promise<any>
}

const createStreamFromChunks = (chunks: string[]) =>
  new ReadableStream<string>({
    start(controller) {
      try {
        for (const chunk of chunks) {
          controller.enqueue(chunk)
        }
      } finally {
        controller.close()
      }
    },
  }).pipeThrough(new TextEncoderStream())

function toHeadersRecord(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {}

  if (!headers) {
    return result
  }

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value
    })
    return result
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      result[String(key).toLowerCase()] = String(value)
    }
    return result
  }

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'undefined') {
      result[key.toLowerCase()] = String(value)
    }
  }

  return result
}

function parseRequestBody(body: BodyInit | null | undefined): any {
  if (body == null) {
    return undefined
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return undefined
    }
  }

  return undefined
}

function createMockServer(routes: Record<string, MockServerRoute>) {
  const urls: Record<string, MockServerRoute> = Object.fromEntries(
    Object.entries(routes).map(([url, config]) => [
      url,
      {
        response: { ...config.response },
      },
    ]),
  )

  const calls: MockServerCall[] = []

  const buildResponse = (definition: MockResponseDefinition): Response => {
    const status = definition.status ?? 200

    if (definition.type === 'json-value') {
      return new Response(JSON.stringify(definition.body), {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...definition.headers,
        },
      })
    }

    return new Response(createStreamFromChunks(definition.chunks), {
      status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...definition.headers,
      },
    })
  }

  const fetchImpl = async (input: RequestInfo, init: RequestInit = {}) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

    const route = urls[url]

    if (!route) {
      return new Response('Not Found', { status: 404 })
    }

    const requestHeaders = toHeadersRecord(init.headers)
    const requestBodyJson = Promise.resolve(parseRequestBody(init.body))

    calls.push({ requestHeaders, requestBodyJson })

    return buildResponse(route.response)
  }

  const fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    fetchImpl(input as RequestInfo, init ?? {})) as typeof global.fetch

  fetch.preconnect = async () => {}

  return {
    urls,
    calls,
    fetch,
  }
}

describe('doGenerate', () => {
  const server = createMockServer({
    'https://openrouter.ai/api/v1/completions': {
      response: { type: 'json-value', body: {} },
    },
  })

  const provider = createOpenRouter({
    apiKey: 'test-api-key',
    compatibility: 'strict',
    fetch: server.fetch,
  })

  const model = provider.completion('openai/gpt-3.5-turbo-instruct')

  beforeEach(() => {
    server.calls.length = 0
    server.urls['https://openrouter.ai/api/v1/completions']!.response = {
      type: 'json-value',
      body: {},
    }
  })

  function prepareJsonResponse({
    content = '',
    usage = {
      prompt_tokens: 4,
      total_tokens: 34,
      completion_tokens: 30,
    },
    logprobs = null,
    finish_reason = 'stop',
  }: {
    content?: string
    usage?: {
      prompt_tokens: number
      total_tokens: number
      completion_tokens: number
    }
    logprobs?: {
      tokens: string[]
      token_logprobs: number[]
      top_logprobs: Record<string, number>[]
    } | null
    finish_reason?: string
  }) {
    server.urls['https://openrouter.ai/api/v1/completions']!.response = {
      type: 'json-value',
      body: {
        id: 'cmpl-96cAM1v77r4jXa4qb2NSmRREV5oWB',
        object: 'text_completion',
        created: 1711363706,
        model: 'openai/gpt-3.5-turbo-instruct',
        choices: [
          {
            text: content,
            index: 0,
            logprobs,
            finish_reason,
          },
        ],
        usage,
      },
    }
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: 'Hello, World!' })

    const { content } = await model.doGenerate({
      prompt: TEST_PROMPT,
    })

    const text = content[0]?.type === 'text' ? content[0].text : ''

    expect(text).toStrictEqual('Hello, World!')
  })

  it('should extract usage', async () => {
    prepareJsonResponse({
      content: '',
      usage: { prompt_tokens: 20, total_tokens: 25, completion_tokens: 5 },
    })

    const { usage } = await model.doGenerate({
      prompt: TEST_PROMPT,
    })

    expect(usage).toStrictEqual({
      inputTokens: 20,
      outputTokens: 5,
      totalTokens: 25,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    })
  })

  it('should extract logprobs', async () => {
    prepareJsonResponse({ logprobs: TEST_LOGPROBS })

    const provider = createOpenRouter({
      apiKey: 'test-api-key',
      fetch: server.fetch,
    })

    await provider
      .completion('openai/gpt-3.5-turbo', { logprobs: 1 })
      .doGenerate({
        prompt: TEST_PROMPT,
      })
  })

  it('should extract finish reason', async () => {
    prepareJsonResponse({
      content: '',
      finish_reason: 'stop',
    })

    const { finishReason } = await provider
      .completion('openai/gpt-3.5-turbo-instruct')
      .doGenerate({
        prompt: TEST_PROMPT,
      })

    expect(finishReason).toStrictEqual('stop')
  })

  it('should support unknown finish reason', async () => {
    prepareJsonResponse({
      content: '',
      finish_reason: 'eos',
    })

    const { finishReason } = await provider
      .completion('openai/gpt-3.5-turbo-instruct')
      .doGenerate({
        prompt: TEST_PROMPT,
      })

    expect(finishReason).toStrictEqual('unknown')
  })

  it('should pass the model and the prompt', async () => {
    prepareJsonResponse({ content: '' })

    await model.doGenerate({
      prompt: TEST_PROMPT,
    })

    expect(await server.calls[0]!.requestBodyJson).toStrictEqual({
      model: 'openai/gpt-3.5-turbo-instruct',
      prompt: 'Hello',
    })
  })

  it('should pass the models array when provided', async () => {
    prepareJsonResponse({ content: '' })

    const customModel = provider.completion('openai/gpt-3.5-turbo-instruct', {
      models: ['openai/gpt-4', 'anthropic/claude-2'],
    })

    await customModel.doGenerate({
      prompt: TEST_PROMPT,
    })

    expect(await server.calls[0]!.requestBodyJson).toStrictEqual({
      model: 'openai/gpt-3.5-turbo-instruct',
      models: ['openai/gpt-4', 'anthropic/claude-2'],
      prompt: 'Hello',
    })
  })

  it('should pass headers', async () => {
    prepareJsonResponse({ content: '' })

    const provider = createOpenRouter({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
      fetch: server.fetch,
    })

    await provider.completion('openai/gpt-3.5-turbo-instruct').doGenerate({
      prompt: TEST_PROMPT,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    })

    const requestHeaders = server.calls[0]!.requestHeaders

    expect(requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'user-agent': 'ai-sdk/provider-utils/3.0.17 runtime/bun/1.3.0',
    })
  })
})

describe('doStream', () => {
  const server = createMockServer({
    'https://openrouter.ai/api/v1/completions': {
      response: { type: 'stream-chunks', chunks: [] },
    },
  })

  const provider = createOpenRouter({
    apiKey: 'test-api-key',
    compatibility: 'strict',
    fetch: server.fetch,
  })

  const model = provider.completion('openai/gpt-3.5-turbo-instruct')

  beforeEach(() => {
    server.calls.length = 0
    server.urls['https://openrouter.ai/api/v1/completions']!.response = {
      type: 'stream-chunks',
      chunks: [],
    }
  })

  function prepareStreamResponse({
    content,
    finish_reason = 'stop',
    usage = {
      prompt_tokens: 10,
      total_tokens: 372,
      completion_tokens: 362,
    },
    logprobs = null,
  }: {
    content: string[]
    usage?: {
      prompt_tokens: number
      total_tokens: number
      completion_tokens: number
    }
    logprobs?: {
      tokens: string[]
      token_logprobs: number[]
      top_logprobs: Record<string, number>[]
    } | null
    finish_reason?: string
  }) {
    server.urls['https://openrouter.ai/api/v1/completions']!.response = {
      type: 'stream-chunks',
      chunks: [
        ...content.map((text) => {
          return `data: {"id":"cmpl-96c64EdfhOw8pjFFgVpLuT8k2MtdT","object":"text_completion","created":1711363440,"choices":[{"text":"${text}","index":0,"logprobs":null,"finish_reason":null}],"model":"openai/gpt-3.5-turbo-instruct"}\n\n`
        }),
        `data: {"id":"cmpl-96c3yLQE1TtZCd6n6OILVmzev8M8H","object":"text_completion","created":1711363310,"choices":[{"text":"","index":0,"logprobs":${JSON.stringify(
          logprobs,
        )},"finish_reason":"${finish_reason}"}],"model":"openai/gpt-3.5-turbo-instruct"}\n\n`,
        `data: {"id":"cmpl-96c3yLQE1TtZCd6n6OILVmzev8M8H","object":"text_completion","created":1711363310,"model":"openai/gpt-3.5-turbo-instruct","usage":${JSON.stringify(
          usage,
        )},"choices":[]}\n\n`,
        'data: [DONE]\n\n',
      ],
    }
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({
      content: ['Hello', ', ', 'World!'],
      finish_reason: 'stop',
      usage: {
        prompt_tokens: 10,
        total_tokens: 372,
        completion_tokens: 362,
      },
      logprobs: TEST_LOGPROBS,
    })

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    })

    // note: space moved to last chunk bc of trimming
    const elements = await convertReadableStreamToArray(stream)
    expect(elements).toStrictEqual([
      { type: 'text-delta', delta: 'Hello', id: expect.any(String) },
      { type: 'text-delta', delta: ', ', id: expect.any(String) },
      { type: 'text-delta', delta: 'World!', id: expect.any(String) },
      { type: 'text-delta', delta: '', id: expect.any(String) },
      {
        type: 'finish',
        finishReason: 'stop',
        providerMetadata: {
          openrouter: {
            usage: {
              promptTokens: 10,
              completionTokens: 362,
              totalTokens: 372,
              cost: undefined,
            } as any,
          },
        },
        usage: {
          inputTokens: 10,
          outputTokens: 362,
          totalTokens: 372,
          reasoningTokens: Number.NaN,
          cachedInputTokens: Number.NaN,
        },
      },
    ])
  })

  it('should handle error stream parts', async () => {
    server.urls['https://openrouter.ai/api/v1/completions']!.response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"error":{"message": "The server had an error processing your request. Sorry about that! You can retry your request, or contact us through our ` +
          `help center at help.openrouter.com if you keep seeing this error.","type":"server_error","param":null,"code":null}}\n\n`,
        'data: [DONE]\n\n',
      ],
    }

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    })

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      {
        type: 'error',
        error: {
          message:
            'The server had an error processing your request. Sorry about that! ' +
            'You can retry your request, or contact us through our help center at ' +
            'help.openrouter.com if you keep seeing this error.',
          type: 'server_error',
          code: null,
          param: null,
        },
      },
      {
        finishReason: 'error',
        providerMetadata: {
          openrouter: {
            usage: {},
          },
        },
        type: 'finish',
        usage: {
          inputTokens: Number.NaN,
          outputTokens: Number.NaN,
          totalTokens: Number.NaN,
          reasoningTokens: Number.NaN,
          cachedInputTokens: Number.NaN,
        },
      },
    ])
  })

  it('should handle unparsable stream parts', async () => {
    server.urls['https://openrouter.ai/api/v1/completions']!.response = {
      type: 'stream-chunks',
      chunks: ['data: {unparsable}\n\n', 'data: [DONE]\n\n'],
    }

    const { stream } = await model.doStream({
      prompt: TEST_PROMPT,
    })

    const elements = await convertReadableStreamToArray(stream)

    expect(elements.length).toBe(2)
    expect(elements[0]?.type).toBe('error')
    expect(elements[1]).toStrictEqual({
      finishReason: 'error',
      providerMetadata: {
        openrouter: {
          usage: {},
        },
      },
      type: 'finish',
      usage: {
        inputTokens: Number.NaN,
        outputTokens: Number.NaN,
        totalTokens: Number.NaN,
        reasoningTokens: Number.NaN,
        cachedInputTokens: Number.NaN,
      },
    })
  })

  it('should pass the model and the prompt', async () => {
    prepareStreamResponse({ content: [] })

    await model.doStream({
      prompt: TEST_PROMPT,
    })

    expect(await server.calls[0]!.requestBodyJson).toStrictEqual({
      stream: true,
      stream_options: { include_usage: true },
      model: 'openai/gpt-3.5-turbo-instruct',
      prompt: 'Hello',
    })
  })

  it('should pass headers', async () => {
    prepareStreamResponse({ content: [] })

    const provider = createOpenRouter({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
      fetch: server.fetch,
    })

    await provider.completion('openai/gpt-3.5-turbo-instruct').doStream({
      prompt: TEST_PROMPT,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    })

    const requestHeaders = server.calls[0]!.requestHeaders

    expect(requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'user-agent': 'ai-sdk/provider-utils/3.0.17 runtime/bun/1.3.0',
    })
  })

  it('should pass extra body', async () => {
    prepareStreamResponse({ content: [] })

    const provider = createOpenRouter({
      apiKey: 'test-api-key',
      extraBody: {
        custom_field: 'custom_value',
        providers: {
          anthropic: {
            custom_field: 'custom_value',
          },
        },
      },
      fetch: server.fetch,
    })

    await provider.completion('openai/gpt-4o').doStream({
      prompt: TEST_PROMPT,
    })

    const requestBody = await server.calls[0]!.requestBodyJson

    expect(requestBody).toHaveProperty('custom_field', 'custom_value')
    expect(requestBody).toHaveProperty(
      'providers.anthropic.custom_field',
      'custom_value',
    )
  })
})
