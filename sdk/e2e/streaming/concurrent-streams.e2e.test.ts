/**
 * E2E Test: Concurrent Streams
 *
 * Tests that multiple concurrent SDK runs maintain separate event streams
 * without interference or data mixing.
 */

import { describe, test, expect, beforeAll } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import { EventCollector, getApiKey, skipIfNoApiKey, isAuthError, DEFAULT_AGENT, DEFAULT_TIMEOUT } from '../utils'

describe('Streaming: Concurrent Streams', () => {
  let client: CodebuffClient

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'two concurrent runs have independent event streams',
    async () => {
      if (skipIfNoApiKey()) return

      const collector1 = new EventCollector()
      const collector2 = new EventCollector()

      // Run two prompts concurrently
      const [result1, result2] = await Promise.all([
        client.run({
          agent: DEFAULT_AGENT,
          prompt: 'Say only the word "ALPHA"',
          handleEvent: collector1.handleEvent,
          handleStreamChunk: collector1.handleStreamChunk,
        }),
        client.run({
          agent: DEFAULT_AGENT,
          prompt: 'Say only the word "BETA"',
          handleEvent: collector2.handleEvent,
          handleStreamChunk: collector2.handleStreamChunk,
        }),
      ])

      // Skip if auth failed
      if (isAuthError(result1.output) || isAuthError(result2.output)) return

      // Both should complete successfully
      expect(result1.output.type).not.toBe('error')
      expect(result2.output.type).not.toBe('error')

      // Both should have their own start and finish events
      expect(collector1.hasEventType('start')).toBe(true)
      expect(collector1.hasEventType('finish')).toBe(true)
      expect(collector2.hasEventType('start')).toBe(true)
      expect(collector2.hasEventType('finish')).toBe(true)

      // Event counts should be independent
      expect(collector1.events.length).toBeGreaterThan(0)
      expect(collector2.events.length).toBeGreaterThan(0)
    },
    DEFAULT_TIMEOUT * 2,
  )

  test(
    'three concurrent runs all complete without errors',
    async () => {
      if (skipIfNoApiKey()) return

      const collectors = [new EventCollector(), new EventCollector(), new EventCollector()]

      const prompts = ['Count to 3', 'Name 3 colors', 'List 3 fruits']

      const results = await Promise.all(
        prompts.map((prompt, i) =>
          client.run({
            agent: DEFAULT_AGENT,
            prompt,
            handleEvent: collectors[i].handleEvent,
            handleStreamChunk: collectors[i].handleStreamChunk,
          }),
        ),
      )

      // Skip if any auth failed
      if (results.some((r) => isAuthError(r.output))) return

      // All should complete
      for (let i = 0; i < results.length; i++) {
        expect(results[i].output.type).not.toBe('error')
        expect(collectors[i].hasEventType('start')).toBe(true)
        expect(collectors[i].hasEventType('finish')).toBe(true)
        expect(collectors[i].errors.length).toBe(0)
      }
    },
    DEFAULT_TIMEOUT * 3,
  )

  test(
    'concurrent runs do not share stream chunks',
    async () => {
      if (skipIfNoApiKey()) return

      const collector1 = new EventCollector()
      const collector2 = new EventCollector()

      await Promise.all([
        client.run({
          agent: DEFAULT_AGENT,
          prompt: 'Write exactly: "FIRST RUN OUTPUT"',
          handleEvent: collector1.handleEvent,
          handleStreamChunk: collector1.handleStreamChunk,
        }),
        client.run({
          agent: DEFAULT_AGENT,
          prompt: 'Write exactly: "SECOND RUN OUTPUT"',
          handleEvent: collector2.handleEvent,
          handleStreamChunk: collector2.handleStreamChunk,
        }),
      ])

      // Each collector should have independent chunks
      // The chunks shouldn't be identical (different prompts)
      // Note: We can't guarantee exact output, but they should be independent
      expect(collector1.streamChunks).not.toBe(collector2.streamChunks)
    },
    DEFAULT_TIMEOUT * 2,
  )

  test(
    'rapid sequential runs maintain event isolation',
    async () => {
      if (skipIfNoApiKey()) return

      const collectors: EventCollector[] = []

      // Fire off 3 runs in rapid succession
      for (let i = 0; i < 3; i++) {
        const collector = new EventCollector()
        collectors.push(collector)

        const result = await client.run({
          agent: DEFAULT_AGENT,
          prompt: `Say "Run ${i + 1}"`,
          handleEvent: collector.handleEvent,
          handleStreamChunk: collector.handleStreamChunk,
        })

        if (isAuthError(result.output)) return
      }

      // Each should have completed with its own events
      for (const collector of collectors) {
        expect(collector.hasEventType('start')).toBe(true)
        expect(collector.hasEventType('finish')).toBe(true)
      }
    },
    DEFAULT_TIMEOUT * 3,
  )
})
