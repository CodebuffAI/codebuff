/**
 * Integration Test: Event Types
 *
 * Validates that the SDK correctly emits all PrintModeEvent types.
 * Event types: start, finish, error, text, tool_call, tool_result,
 * subagent_start, subagent_finish, reasoning_delta, download
 */

import { describe, test, expect, beforeAll } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import { EventCollector, getApiKey, skipIfNoApiKey, isAuthError, DEFAULT_AGENT, DEFAULT_TIMEOUT } from '../utils'

describe('Integration: Event Types', () => {
  let client: CodebuffClient

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'emits start event at the beginning of a run',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say "hello"',
        handleEvent: collector.handleEvent,
      })

      // Skip if auth failed
      if (isAuthError(result.output)) return

      const startEvents = collector.getEventsByType('start')
      expect(startEvents.length).toBeGreaterThanOrEqual(1)

      const firstStart = startEvents[0]
      expect(firstStart).toBeDefined()
      expect(typeof firstStart.messageHistoryLength).toBe('number')
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'emits finish event at the end of a run',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say "hello"',
        handleEvent: collector.handleEvent,
      })

      // Skip if auth failed
      if (isAuthError(result.output)) return

      const finishEvents = collector.getEventsByType('finish')
      expect(finishEvents.length).toBeGreaterThanOrEqual(1)

      const lastFinish = finishEvents[finishEvents.length - 1]
      expect(lastFinish).toBeDefined()
      expect(typeof lastFinish.totalCost).toBe('number')
      expect(lastFinish.totalCost).toBeGreaterThanOrEqual(0)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'emits text events during response generation',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Write a short poem about coding (2-3 lines)',
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      const textEvents = collector.getEventsByType('text')
      expect(textEvents.length).toBeGreaterThan(0)

      const fullText = collector.getFullText()
      expect(fullText.length).toBeGreaterThan(0)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'emits tool_call and tool_result events when tools are used',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'List the files in the current directory using a tool',
        handleEvent: collector.handleEvent,
        cwd: process.cwd(),
      })

      if (isAuthError(result.output)) return

      // Check if any tool calls were made
      const toolCalls = collector.getEventsByType('tool_call')
      const toolResults = collector.getEventsByType('tool_result')

      // If tools were used, we should have matching calls and results
      if (toolCalls.length > 0) {
        expect(toolResults.length).toBeGreaterThan(0)

        // Verify tool call structure
        const firstCall = toolCalls[0]
        expect(firstCall.toolCallId).toBeDefined()
        expect(firstCall.toolName).toBeDefined()
        expect(firstCall.input).toBeDefined()

        // Verify tool result structure
        const firstResult = toolResults[0]
        expect(firstResult.toolCallId).toBeDefined()
        expect(firstResult.toolName).toBeDefined()
        expect(firstResult.output).toBeDefined()
      }
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'event types have correct structure',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say hello',
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      // All events should have a type field
      for (const event of collector.events) {
        expect(event.type).toBeDefined()
        expect(typeof event.type).toBe('string')
      }

      // Verify we got at least start and finish
      expect(collector.hasEventType('start')).toBe(true)
      expect(collector.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'logs all event types for debugging (collector summary)',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say a greeting and explain what 2+2 equals',
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      const summary = collector.getSummary()

      console.log('Event Summary:', JSON.stringify(summary, null, 2))

      expect(summary.totalEvents).toBeGreaterThan(0)
      expect(summary.hasErrors).toBe(false)
    },
    DEFAULT_TIMEOUT,
  )
})
