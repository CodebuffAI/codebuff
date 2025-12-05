/**
 * E2E Test: Multi-Turn Conversation
 *
 * Tests previousRun chaining across multiple conversation turns.
 */

import { describe, test, expect, beforeAll } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import { EventCollector, getApiKey, skipIfNoApiKey, isAuthError, DEFAULT_AGENT, DEFAULT_TIMEOUT } from '../utils'

describe('Workflows: Multi-Turn Conversation', () => {
  let client: CodebuffClient

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'maintains context across two turns',
    async () => {
      if (skipIfNoApiKey()) return

      const collector1 = new EventCollector()
      const collector2 = new EventCollector()

      // First turn - establish context
      const run1 = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'My favorite number is 42. Remember this.',
        handleEvent: collector1.handleEvent,
      })

      if (isAuthError(run1.output)) return

      expect(run1.output.type).not.toBe('error')

      // Second turn - reference previous context
      const run2 = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'What is my favorite number that I told you?',
        previousRun: run1,
        handleEvent: collector2.handleEvent,
      })

      if (isAuthError(run2.output)) return

      expect(run2.output.type).not.toBe('error')

      const responseText = collector2.getFullText()
      expect(responseText.toLowerCase()).toContain('42')
    },
    DEFAULT_TIMEOUT * 2,
  )

  test(
    'maintains context across three turns',
    async () => {
      if (skipIfNoApiKey()) return

      const collectors = [new EventCollector(), new EventCollector(), new EventCollector()]

      // Turn 1
      const run1 = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'I am building a todo app. Remember this project context.',
        handleEvent: collectors[0].handleEvent,
      })

      // Turn 2
      const run2 = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'What features should I add to my app?',
        previousRun: run1,
        handleEvent: collectors[1].handleEvent,
      })

      // Turn 3
      const run3 = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Can you summarize what app we are discussing?',
        previousRun: run2,
        handleEvent: collectors[2].handleEvent,
      })

      if (isAuthError(run1.output) || isAuthError(run2.output) || isAuthError(run3.output)) return

      expect(run3.output.type).not.toBe('error')

      const responseText = collectors[2].getFullText().toLowerCase()
      expect(responseText.includes('todo') || responseText.includes('task')).toBe(true)
    },
    DEFAULT_TIMEOUT * 3,
  )

  test(
    'each turn produces independent events',
    async () => {
      if (skipIfNoApiKey()) return

      const collector1 = new EventCollector()
      const collector2 = new EventCollector()

      const run1 = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say "first"',
        handleEvent: collector1.handleEvent,
      })

      if (isAuthError(run1.output)) return

      const run2 = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say "second"',
        previousRun: run1,
        handleEvent: collector2.handleEvent,
      })

      if (isAuthError(run2.output)) return

      // Both should have their own start/finish
      expect(collector1.hasEventType('start')).toBe(true)
      expect(collector1.hasEventType('finish')).toBe(true)
      expect(collector2.hasEventType('start')).toBe(true)
      expect(collector2.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT * 2,
  )
})
