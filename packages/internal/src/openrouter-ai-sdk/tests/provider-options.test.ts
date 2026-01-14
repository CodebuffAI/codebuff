import { streamText } from 'ai'
import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { createOpenRouter } from '../provider'

import type { ModelMessage } from 'ai'

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

// Add type assertions for the mocked classes
const TEST_MESSAGES: ModelMessage[] = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
]

describe('providerOptions', () => {
  const server = createMockServer({
    'https://openrouter.ai/api/v1/chat/completions': {
      response: {
        type: 'stream-chunks',
        chunks: [],
      },
    },
  })

  const openrouter = createOpenRouter({
    apiKey: 'test',
    fetch: server.fetch,
  })

  beforeEach(() => {
    mock.clearAllMocks()
    server.calls.length = 0
    server.urls['https://openrouter.ai/api/v1/chat/completions']!.response = {
      type: 'stream-chunks',
      chunks: [
        'data: {"choices":[{"delta":{"content":"ok"}}]}' + '\n\n',
        'data: [DONE]' + '\n\n',
      ],
    }
  })

  it('should set providerOptions openrouter to extra body', async () => {
    const model = openrouter('anthropic/claude-3.7-sonnet')

    await streamText({
      model: model,
      messages: TEST_MESSAGES,
      providerOptions: {
        openrouter: {
          reasoning: {
            max_tokens: 1000,
          },
        },
      },
    }).consumeStream()

    const requestBody = await server.calls[0]?.requestBodyJson

    expect(requestBody).toStrictEqual({
      messages: [
        {
          content: [{ type: 'text', text: 'Hello' }],
          role: 'user',
        },
      ],
      reasoning: {
        max_tokens: 1000,
      },
      model: 'anthropic/claude-3.7-sonnet',
      stream: true,
    })
  })
})
