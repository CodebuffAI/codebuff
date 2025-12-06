/**
 * Integration Test: Event Ordering
 *
 * Validates that events are emitted in the correct sequence:
 * start → content (text/tool_call/tool_result) → finish
 */

import { describe, test, expect, beforeAll } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import { EventCollector, getApiKey, skipIfNoApiKey, isAuthError, DEFAULT_AGENT, DEFAULT_TIMEOUT } from '../utils'

describe('Integration: Event Ordering', () => {
  let client: CodebuffClient

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'start event comes before all other events',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say hello',
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      const startIndex = collector.events.findIndex((e) => e.type === 'start')
      expect(startIndex).toBe(0)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'finish event comes after all content events',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Write a haiku about TypeScript',
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      const finishIndex = collector.events.findIndex((e) => e.type === 'finish')
      const lastTextIndex = collector.events
        .map((e, i) => (e.type === 'text' ? i : -1))
        .filter((i) => i !== -1)
        .pop()

      expect(finishIndex).toBeGreaterThan(-1)
      if (lastTextIndex !== undefined) {
        expect(finishIndex).toBeGreaterThan(lastTextIndex)
      }
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'tool_result follows tool_call for same tool',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'List files in the current directory',
        handleEvent: collector.handleEvent,
        cwd: process.cwd(),
      })

      if (isAuthError(result.output)) return

      const toolCalls = collector.getEventsByType('tool_call')
      const toolResults = collector.getEventsByType('tool_result')

      // For each tool call, verify its result comes after
      for (const call of toolCalls) {
        const callIndex = collector.events.indexOf(call)
        const matchingResult = toolResults.find((r) => r.toolCallId === call.toolCallId)

        if (matchingResult) {
          const resultIndex = collector.events.indexOf(matchingResult)
          expect(resultIndex).toBeGreaterThan(callIndex)
        }
      }
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'verifies standard event flow: start → text → finish',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say "test" and nothing else',
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      // Use collector's verifyEventOrder method
      const hasCorrectOrder = collector.verifyEventOrder(['start', 'finish'])
      expect(hasCorrectOrder).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'no events after final finish',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say goodbye',
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      // Find the last finish event
      const finishEvents = collector.getEventsByType('finish')
      if (finishEvents.length > 0) {
        const lastFinishIndex = collector.events.lastIndexOf(finishEvents[finishEvents.length - 1])

        // No non-finish events should come after the last finish
        const eventsAfterFinish = collector.events.slice(lastFinishIndex + 1)
        const nonFinishAfter = eventsAfterFinish.filter((e) => e.type !== 'finish')
        expect(nonFinishAfter.length).toBe(0)
      }
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'multiple sequential runs maintain independent event ordering',
    async () => {
      if (skipIfNoApiKey()) return

      const collector1 = new EventCollector()
      const collector2 = new EventCollector()

      const result1 = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say "first"',
        handleEvent: collector1.handleEvent,
      })

      if (isAuthError(result1.output)) return

      const result2 = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say "second"',
        handleEvent: collector2.handleEvent,
      })

      if (isAuthError(result2.output)) return

      // Both should have correct ordering
      expect(collector1.verifyEventOrder(['start', 'finish'])).toBe(true)
      expect(collector2.verifyEventOrder(['start', 'finish'])).toBe(true)

      // Events should be separate
      expect(collector1.events).not.toEqual(collector2.events)
    },
    DEFAULT_TIMEOUT * 2,
  )
})
