/**
 * The client half of the contract with the server's grace flush.
 *
 * Once the server has flushed SSE headers (web/src/app/api/v1/chat/completions/
 * grace-flush.ts), a provider failure can no longer be an HTTP status, so it
 * arrives as an in-band chunk. These pin what that chunk has to look like for
 * the CLI to surface it usefully — the properties are the AI SDK's, not ours,
 * so an upgrade could regress them silently.
 */
import http from 'node:http'

import { isTransientNetworkError } from '@codebuff/common/util/error'
// The vendored fork, which is what model-provider.ts actually builds the
// backend model from. Testing against the npm @ai-sdk/openai-compatible would
// prove nothing about the client users are running.
import { OpenAICompatibleChatLanguageModel } from '@codebuff/llm-providers/openai-compatible'
import { streamText } from 'ai'
import { describe, expect, it } from 'bun:test'

import { classifyThrownStreamRecovery } from '../stream-interruption'

/** Serves SSE headers, then `body`, then ends — the post-grace-flush shape. */
const serveSse = async (body: string) => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(': connecting\n\n')
    setTimeout(() => {
      res.write(body)
      res.end()
    }, 10)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, port: (server.address() as { port: number }).port }
}

const consume = async (port: number) => {
  const result = streamText({
    model: new OpenAICompatibleChatLanguageModel('m', {
      provider: 'codebuff',
      url: () => `http://127.0.0.1:${port}/chat/completions`,
      headers: () => ({}),
    }),
    messages: [{ role: 'user', content: 'hi' }],
    maxRetries: 0,
  })
  let error: unknown
  try {
    for await (const part of result.stream) {
      if (part.type === 'error') error = (part as { error: unknown }).error
    }
  } catch (thrown) {
    error ??= thrown
  }
  await Promise.resolve(result.text).catch((thrown: unknown) => {
    error ??= thrown
  })
  return error
}

const withServer = async (body: string, assert: (error: unknown) => void) => {
  const { server, port } = await serveSse(body)
  try {
    assert(await consume(port))
  } finally {
    server.close()
  }
}

const errorChunk = (error: Record<string, unknown>) =>
  `data: ${JSON.stringify({ error })}\n\n`

describe('late failure delivered in band', () => {
  it('surfaces the message of an OpenAI-shaped error chunk', async () => {
    await withServer(
      errorChunk({
        message: 'Upstream provider error (429): Model is at capacity.',
        type: 'upstream_error',
      }),
      (error) => {
        // llm.ts rethrows the error part as fatal; run-agent-step then shows
        // this to the user, so it has to read as the provider's own message.
        expect(String(error)).toContain(
          'Upstream provider error (429): Model is at capacity.',
        )
        // Crucially not a "transient network" error: that classification makes
        // classifyThrownStreamRecovery retry the step silently instead.
        expect(isTransientNetworkError(error)).toBe(false)
        expect(
          classifyThrownStreamRecovery({ aborted: false, error }),
        ).toBeNull()
      },
    )
  })

  it('is why a bare connection cut is not good enough', () => {
    // The behaviour the in-band chunk exists to avoid. Erroring the response
    // body mid-stream reaches Bun's fetch as this message (confirmed against a
    // server that destroyed the socket after flushing SSE headers), which is
    // indistinguishable from a genuine network drop: the real cause is replaced
    // by a network message and the step is retried against a provider that is
    // already failing. Asserted on the message rather than by cutting a real
    // socket, whose teardown timing is not deterministic enough to test on.
    const cut = new Error(
      'The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()',
    )
    expect(isTransientNetworkError(cut)).toBe(true)
    expect(
      classifyThrownStreamRecovery({ aborted: false, error: cut }),
    ).not.toBeNull()
  })

  it('needs the object form — a bare string fails the response schema', async () => {
    // Guards the shape choice: `{error: "..."}` parses as a validation failure
    // and buries the message under Zod output.
    await withServer(errorChunk('just a string' as never), (error) => {
      expect(String(error)).toContain('Type validation failed')
    })
  })
})
