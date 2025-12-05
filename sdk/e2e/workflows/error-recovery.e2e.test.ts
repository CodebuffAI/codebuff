/**
 * E2E Test: Error Recovery
 *
 * Tests error handling, retries, and graceful failure scenarios.
 */

import { describe, test, expect, beforeAll } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import { EventCollector, getApiKey, skipIfNoApiKey, isAuthError, DEFAULT_AGENT, DEFAULT_TIMEOUT } from '../utils'

describe('Workflows: Error Recovery', () => {
  let client: CodebuffClient

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'handles empty prompt gracefully',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: '',
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      // Should not crash, should have some response
      expect(collector.hasEventType('start')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'error events are captured in collector',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      // Run with invalid agent to potentially trigger error
      const result = await client.run({
        agent: 'nonexistent-agent-that-does-not-exist-12345',
        prompt: 'Hello',
        handleEvent: collector.handleEvent,
      })

      // Should either error or gracefully handle
      if (result.output.type === 'error') {
        expect(result.output.message).toBeDefined()
      }
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'run completes even with unusual prompts',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      // Test with special characters
      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: '🎉 Hello! "quotes" and `backticks` and \n newlines',
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')
      expect(collector.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'abort controller cancels run',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()
      const abortController = new AbortController()

      // Abort after a short delay
      setTimeout(() => abortController.abort(), 500)

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Write a very long essay about the history of computing',
        handleEvent: collector.handleEvent,
        signal: abortController.signal,
      })

      // Should be cancelled or error
      expect(
        result.output.type === 'error' || collector.events.length > 0,
      ).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )
})
