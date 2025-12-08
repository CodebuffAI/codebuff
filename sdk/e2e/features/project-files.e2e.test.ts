/**
 * E2E Test: Project Files
 *
 * Tests projectFiles injection for providing file context to the agent.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import {
  EventCollector,
  getApiKey,
  isAuthError,
  ensureBackendConnection,
  SAMPLE_PROJECT_FILES,
  DEFAULT_AGENT,
  DEFAULT_TIMEOUT,
} from '../utils'

describe('Features: Project Files', () => {
  let client: CodebuffClient

  beforeAll(() => {
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  beforeEach(async () => {
    await ensureBackendConnection()
  })

  test(
    'agent can reference injected project files',
    async () => {
      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'What files are in my project? List them.',
        projectFiles: SAMPLE_PROJECT_FILES,
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      if (result.output.type === 'error') return
      expect(collector.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'agent can analyze content of project files',
    async () => {
      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'What does the Calculator class in my project do?',
        projectFiles: SAMPLE_PROJECT_FILES,
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')
      expect(collector.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )
})
