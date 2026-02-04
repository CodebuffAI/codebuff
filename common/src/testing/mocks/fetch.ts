/** Typed fetch mock utilities for testing. */

import { mock } from 'bun:test'

import type { Mock } from 'bun:test'

export interface MockResponseOptions {
  status?: number
  statusText?: string
  headers?: HeadersInit
}

export type MockFetch = Mock<typeof globalThis.fetch>

export interface InstallMockFetchResult {
  mockFetch: MockFetch
  restore: () => void
  getCalls: () => MockFetchCall[]
  clear: () => void
}

export interface MockFetchCall {
  url: string | URL | Request
  init?: RequestInit
  jsonBody?: unknown
}

export interface CreateMockFetchOptions {
  defaultImpl?: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>
}

/** Creates a Response with JSON body. */
export function mockJsonResponse(
  data: unknown,
  options: MockResponseOptions = {},
): Response {
  const { status = 200, statusText, headers = {} } = options

  return new Response(JSON.stringify(data), {
    status,
    statusText,
    headers: {
      'Content-Type': 'application/json',
      ...normalizeHeaders(headers),
    },
  })
}

/** Creates a Response with text body. */
export function mockTextResponse(
  text: string,
  options: MockResponseOptions = {},
): Response {
  const { status = 200, statusText, headers = {} } = options

  return new Response(text, {
    status,
    statusText,
    headers: {
      'Content-Type': 'text/plain',
      ...normalizeHeaders(headers),
    },
  })
}

/** Creates an error Response with default status text. */
export function mockErrorResponse(
  status: number,
  body?: string | object,
  options: Omit<MockResponseOptions, 'status'> = {},
): Response {
  const { statusText, headers = {} } = options

  let responseBody: string
  let contentType: string

  if (body === undefined) {
    responseBody = ''
    contentType = 'text/plain'
  } else if (typeof body === 'string') {
    responseBody = body
    contentType = 'text/plain'
  } else {
    responseBody = JSON.stringify(body)
    contentType = 'application/json'
  }

  return new Response(responseBody, {
    status,
    statusText: statusText ?? getDefaultStatusText(status),
    headers: {
      'Content-Type': contentType,
      ...normalizeHeaders(headers),
    },
  })
}

/** Creates a mock fetch function. */
export function createMockFetch(
  options: CreateMockFetchOptions = {},
): MockFetch {
  const { defaultImpl } = options

  const baseFn =
    defaultImpl ??
    (async (): Promise<Response> => {
      throw new Error('Mock fetch not configured for this call')
    })

  const mockFn = Object.assign(mock(baseFn), {
    preconnect: mock(async () => {}),
  }) as unknown as MockFetch

  return mockFn
}

/**
 * Installs mock fetch globally. Returns mockFetch for configuration -
 * the wrapper always captures calls before delegating to mockFetch.
 */
export function installMockFetch(
  options: CreateMockFetchOptions = {},
): InstallMockFetchResult {
  const originalFetch = globalThis.fetch
  const capturedCalls: MockFetchCall[] = []

  const mockFetch = createMockFetch({
    defaultImpl:
      options.defaultImpl ??
      (async (): Promise<Response> => {
        throw new Error('Mock fetch not configured for this call')
      }),
  })

  // Wrap to capture calls
  const wrappedMockFn = mock(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const call: MockFetchCall = {
        url: input,
        init,
      }

      // Try to parse JSON body if present
      if (init?.body && typeof init.body === 'string') {
        try {
          call.jsonBody = JSON.parse(init.body)
        } catch {
          // Not JSON, that's fine
        }
      }

      capturedCalls.push(call)

      // Call the actual mock implementation
      return mockFetch(input, init)
    },
  )

  const wrappedMock = Object.assign(wrappedMockFn, {
    preconnect: mock(async () => {}),
  }) as unknown as MockFetch

  ;(globalThis as any).fetch = wrappedMock

  return {
    mockFetch,
    restore: () => {
      globalThis.fetch = originalFetch
    },
    getCalls: () => [...capturedCalls],
    clear: () => {
      capturedCalls.length = 0
      mockFetch.mockClear()
      wrappedMock.mockClear()
    },
  }
}

function normalizeHeaders(headers: HeadersInit): Record<string, string> {
  if (headers instanceof Headers) {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => {
      result[key] = value
    })
    return result
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }

  return headers as Record<string, string>
}

function getDefaultStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  }

  return statusTexts[status] ?? ''
}
