import {
  BYOK_OPENROUTER_ENV_VAR,
  BYOK_OPENROUTER_HEADER,
} from '@codebuff/common/constants/byok'
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { streamText } from 'ai'
import { z } from 'zod'

import { promptAiSdk, promptAiSdkStream, promptAiSdkStructured } from '../llm'
import { getModelForRequest } from '../model-provider'

const originalKey = process.env[BYOK_OPENROUTER_ENV_VAR]
const legacyKey = 'legacy-openrouter-key-canary'
const content = '{"answer":"ok"}'
const logger = { debug() {}, info() {}, warn() {}, error() {} }

beforeEach(() => {
  process.env[BYOK_OPENROUTER_ENV_VAR] = legacyKey
})

afterEach(() => {
  if (originalKey === undefined) delete process.env[BYOK_OPENROUTER_ENV_VAR]
  else process.env[BYOK_OPENROUTER_ENV_VAR] = originalKey
})

describe('Freebuff provider credentials', () => {
  test('an explicitly selected BYOK connection still uses its selected key and endpoint', async () => {
    const requests: Array<{ url: string; headers: Headers }> = []
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      (async (input, init) => {
        requests.push({
          url: String(input),
          headers: new Headers(init?.headers),
        })
        return new Response(
          'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        )
      }) as typeof fetch,
    )
    try {
      const response = streamText({
        model: getModelForRequest({
          apiKey: 'freebuff-login-token',
          model: 'ignored/model',
          costMode: 'free',
          byok: {
            id: 'connection',
            revision: 1,
            name: 'My provider',
            provider: 'openai-compatible',
            baseUrl: 'https://provider.example/v1',
            model: 'selected/model',
            apiKey: 'explicit-provider-key',
            credentialRef: 'connection:connection',
            createdAt: 'x',
            updatedAt: 'x',
          },
        }),
        messages: [{ role: 'user', content: 'hello' }],
      })
      expect(await response.text).toBe('ok')
      expect(requests).toHaveLength(1)
      expect(requests[0]!.url).toBe(
        'https://provider.example/v1/chat/completions',
      )
      expect(requests[0]!.headers.get('authorization')).toBe(
        'Bearer explicit-provider-key',
      )
      expect(requests[0]!.headers.get(BYOK_OPENROUTER_HEADER)).toBeNull()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  for (const kind of ['stream', 'text', 'structured'] as const) {
    test.each(['free', 'normal'])(
      `${kind}: provider key selection for %s mode`,
      async (costMode) => {
        const requests: Array<{ url: string; headers: Headers; body: string }> =
          []
        const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
          (async (input, init) => {
            const body = String(init?.body)
            requests.push({
              url: String(input),
              headers: new Headers(init?.headers),
              body,
            })
            if (JSON.parse(body).stream) {
              return new Response(
                `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
                { headers: { 'content-type': 'text/event-stream' } },
              )
            }
            return Response.json({
              id: 'completion',
              model: 'openai/gpt-6.1-sol',
              choices: [
                {
                  message: { role: 'assistant', content },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
              },
            })
          }) as typeof fetch,
        )
        try {
          const params = {
            apiKey: 'freebuff-login-token',
            model: 'openai/gpt-6.1-sol',
            costMode,
            runId: 'run',
            clientSessionId: 'session',
            fingerprintId: 'fingerprint',
            userInputId: 'input',
            userId: 'user',
            messages: [
              {
                role: 'user' as const,
                content: [{ type: 'text' as const, text: 'hello' }],
              },
            ],
            includeCacheControl: false,
            sendAction() {},
            trackEvent() {},
            logger,
            signal: new AbortController().signal,
          }
          if (kind === 'stream') {
            for await (const _chunk of promptAiSdkStream(params)) {
              // Drain the real SDK stream so its request reaches the fetch boundary.
            }
          } else if (kind === 'structured') {
            await promptAiSdkStructured({
              ...params,
              schema: z.object({ answer: z.string() }),
            })
          } else {
            await promptAiSdk(params)
          }
          expect(requests).toHaveLength(1)
          const request = requests[0]!
          expect(new URL(request.url).pathname).toBe('/api/v1/chat/completions')
          expect(request.headers.get('authorization')).toBe(
            'Bearer freebuff-login-token',
          )
          expect(JSON.parse(request.body).codebuff_metadata.cost_mode).toBe(
            costMode,
          )
          expect(request.headers.get(BYOK_OPENROUTER_HEADER)).toBe(
            costMode === 'free' ? null : legacyKey,
          )
          expect(request.body).not.toContain(legacyKey)
        } finally {
          fetchSpy.mockRestore()
        }
      },
    )
  }
})
