/**
 * E2E Test: Max Agent Steps
 *
 * Tests the maxAgentSteps option for limiting agent execution.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import {
  EventCollector,
  getApiKey,
  isAuthError,
  ensureBackendConnection,
  DEFAULT_AGENT,
  DEFAULT_TIMEOUT,
} from '../utils'

describe('Features: Max Agent Steps', () => {
  let client: CodebuffClient

  beforeAll(() => {
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  beforeEach(async () => {
    await ensureBackendConnection()
  })

  test(
    'run completes with maxAgentSteps set',
    async () => {

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'Say hello',
        maxAgentSteps: 5,
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')
      expect(collector.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'low maxAgentSteps still allows simple responses',
    async () => {

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'What is 2 + 2?',
        maxAgentSteps: 2,
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      // Should still complete for simple prompts
      expect(collector.hasEventType('start')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )
})
