/**
 * E2E Test: Project Files
 *
 * Tests projectFiles injection for providing file context to the agent.
 */

import { describe, test, expect, beforeAll } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import {
  EventCollector,
  getApiKey,
  skipIfNoApiKey,
  isAuthError,
  SAMPLE_PROJECT_FILES,
  DEFAULT_AGENT,
  DEFAULT_TIMEOUT,
} from '../utils'

describe('Features: Project Files', () => {
  let client: CodebuffClient

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'agent can reference injected project files',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'What files are in my project? List them.',
        projectFiles: SAMPLE_PROJECT_FILES,
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')

      const responseText = collector.getFullText().toLowerCase()
      // Should mention some of the files
      expect(
        responseText.includes('index') ||
          responseText.includes('calculator') ||
          responseText.includes('package.json') ||
          responseText.includes('readme'),
      ).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'agent can analyze content of project files',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'What does the Calculator class in my project do?',
        projectFiles: SAMPLE_PROJECT_FILES,
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')

      const responseText = collector.getFullText().toLowerCase()
      expect(
        responseText.includes('calculator') ||
          responseText.includes('add') ||
          responseText.includes('result'),
      ).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )
})
