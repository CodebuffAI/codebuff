/**
 * E2E Test: Knowledge Files
 *
 * Tests knowledgeFiles injection for providing context to the agent.
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

describe('Features: Knowledge Files', () => {
  let client: CodebuffClient
  let apiKey: string | null = null

  beforeAll(() => {
    apiKey = process.env.CODEBUFF_API_KEY ?? null
    if (!apiKey) {
      // Skip gracefully if no API key is configured
      test.skip('CODEBUFF_API_KEY is required for knowledge files e2e')
      return
    }
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  beforeEach(async () => {
    if (!apiKey) return
    await ensureBackendConnection()
  })

  test(
    'agent uses injected knowledge files',
    async () => {
      if (!apiKey) return
      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'What is the secret code word mentioned in my knowledge files?',
        knowledgeFiles: {
          'knowledge/secret.md': 'The secret code word is: PINEAPPLE42',
        },
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')
      const responseText = collector.getFullText().toUpperCase()
      expect(
        responseText.includes('PINEAPPLE42') ||
          responseText.includes('PINEAPPLE'),
      ).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'multiple knowledge files are accessible',
    async () => {
      if (!apiKey) return
      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt:
          'What are the two company values mentioned in my knowledge files?',
        knowledgeFiles: {
          'knowledge/values.md':
            'Company value 1: Innovation\nCompany value 2: Integrity',
          'knowledge/mission.md': 'Our mission is to build great software.',
        },
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')
      const responseText = collector.getFullText().toLowerCase()
      expect(
        responseText.includes('innovation') ||
          responseText.includes('integrity'),
      ).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )
})
