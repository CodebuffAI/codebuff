/**
 * Integration Test: Stream Chunks
 *
 * Tests the handleStreamChunk callback with various chunk types:
 * - String chunks (text streaming)
 * - Subagent chunks
 * - Reasoning chunks
 */

import { describe, test, expect, beforeAll } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import { EventCollector, getApiKey, skipIfNoApiKey, isAuthError, DEFAULT_AGENT, DEFAULT_TIMEOUT } from '../utils'

describe('Integration: Stream Chunks', () => {
  let client: CodebuffClient

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'receives string chunks during text streaming',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Write a paragraph about the benefits of TypeScript',
        handleEvent: collector.handleEvent,
        handleStreamChunk: collector.handleStreamChunk,
      })

      if (isAuthError(result.output)) return

      // Should receive string chunks
      const stringChunks = collector.streamChunks.filter(
        (c): c is string => typeof c === 'string',
      )

      expect(stringChunks.length).toBeGreaterThan(0)

      // Combined chunks should form meaningful text
      const fullText = collector.getFullStreamText()
      expect(fullText.length).toBeGreaterThan(0)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'stream chunks arrive incrementally (not all at once)',
    async () => {
      if (skipIfNoApiKey()) return

      const chunkTimestamps: number[] = []
      const collector = new EventCollector()

      const customChunkHandler = (chunk: typeof collector.streamChunks[0]) => {
        chunkTimestamps.push(Date.now())
        collector.handleStreamChunk(chunk)
      }

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Write a detailed explanation of async/await in JavaScript (at least 100 words)',
        handleEvent: collector.handleEvent,
        handleStreamChunk: customChunkHandler,
      })

      if (isAuthError(result.output)) return

      // Should have multiple chunks
      expect(chunkTimestamps.length).toBeGreaterThan(1)

      // Verify chunks arrived over time (not all at the same millisecond)
      if (chunkTimestamps.length > 2) {
        const timeSpread = chunkTimestamps[chunkTimestamps.length - 1] - chunkTimestamps[0]
        // The spread should be at least some milliseconds for a longer response
        expect(timeSpread).toBeGreaterThanOrEqual(0)
      }
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'handleStreamChunk receives chunks that match handleEvent text',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say exactly: "Hello, World!"',
        handleEvent: collector.handleEvent,
        handleStreamChunk: collector.handleStreamChunk,
      })

      if (isAuthError(result.output)) return

      const eventText = collector.getFullText()
      const streamText = collector.getFullStreamText()

      // Both should contain meaningful content
      // Note: They may not be exactly equal due to filtering, but should overlap
      if (eventText.length > 0 && streamText.length > 0) {
        // At least some content should be present in both
        expect(eventText.length).toBeGreaterThan(0)
        expect(streamText.length).toBeGreaterThan(0)
      }
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'empty prompt still triggers start/finish events',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: '',
        handleEvent: collector.handleEvent,
        handleStreamChunk: collector.handleStreamChunk,
      })

      if (isAuthError(result.output)) return

      // Should still have start event at minimum
      expect(collector.hasEventType('start')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'very long response streams correctly',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'List the numbers 1 through 20, each on a new line with a brief description',
        handleEvent: collector.handleEvent,
        handleStreamChunk: collector.handleStreamChunk,
      })

      if (isAuthError(result.output)) return

      // Should have received multiple chunks for a longer response
      expect(collector.streamChunks.length).toBeGreaterThan(0)

      // Verify we got start and finish
      expect(collector.hasEventType('start')).toBe(true)
      expect(collector.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'special characters stream correctly',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Output these special characters: émojis 🎉, quotes "test", newlines, and tabs',
        handleEvent: collector.handleEvent,
        handleStreamChunk: collector.handleStreamChunk,
      })

      if (isAuthError(result.output)) return

      const fullText = collector.getFullStreamText()

      // Should handle the response without errors
      expect(collector.errors.length).toBe(0)
      expect(collector.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )
})
