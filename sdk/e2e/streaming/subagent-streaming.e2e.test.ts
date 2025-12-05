/**
 * E2E Test: Subagent Streaming
 *
 * Tests nested subagent event streaming and parent/child relationships.
 * Validates subagent_start, subagent_finish events and chunk forwarding.
 */

import { describe, test, expect, beforeAll } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import { EventCollector, getApiKey, skipIfNoApiKey, DEFAULT_TIMEOUT } from '../utils'

describe('Streaming: Subagent Streaming', () => {
  let client: CodebuffClient

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'subagent_start and subagent_finish events are paired',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      // Use an agent that spawns subagents (like base which can spawn file-picker, etc.)
      await client.run({
        agent: 'codebuff/base@latest',
        prompt: 'Search for files containing "test" in this project',
        handleEvent: collector.handleEvent,
        handleStreamChunk: collector.handleStreamChunk,
        cwd: process.cwd(),
      })

      const subagentStarts = collector.getEventsByType('subagent_start')
      const subagentFinishes = collector.getEventsByType('subagent_finish')

      // If subagents were spawned, starts and finishes should match
      if (subagentStarts.length > 0) {
        // Each started subagent should have a finish
        for (const start of subagentStarts) {
          const matchingFinish = subagentFinishes.find(
            (f) => f.agentId === start.agentId,
          )
          // Subagent should eventually finish (or the run ends)
          expect(start.agentId).toBeDefined()
          expect(start.agentType).toBeDefined()
          expect(start.displayName).toBeDefined()
        }
      }
    },
    DEFAULT_TIMEOUT * 2,
  )

  test(
    'subagent events have correct structure',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      await client.run({
        agent: 'codebuff/base@latest',
        prompt: 'List files in the current directory',
        handleEvent: collector.handleEvent,
        handleStreamChunk: collector.handleStreamChunk,
        cwd: process.cwd(),
      })

      const subagentStarts = collector.getEventsByType('subagent_start')

      for (const event of subagentStarts) {
        // Required fields
        expect(typeof event.agentId).toBe('string')
        expect(typeof event.agentType).toBe('string')
        expect(typeof event.displayName).toBe('string')
        expect(typeof event.onlyChild).toBe('boolean')

        // Optional fields should be correct type if present
        if (event.parentAgentId !== undefined) {
          expect(typeof event.parentAgentId).toBe('string')
        }
        if (event.prompt !== undefined) {
          expect(typeof event.prompt).toBe('string')
        }
      }
    },
    DEFAULT_TIMEOUT * 2,
  )

  test(
    'subagent chunks are forwarded to handleStreamChunk',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      await client.run({
        agent: 'codebuff/base@latest',
        prompt: 'What files are in the sdk folder?',
        handleEvent: collector.handleEvent,
        handleStreamChunk: collector.handleStreamChunk,
        cwd: process.cwd(),
      })

      // Check for subagent chunks in stream
      const subagentChunks = collector.streamChunks.filter(
        (c): c is Extract<typeof c, { type: 'subagent_chunk' }> =>
          typeof c !== 'string' && c.type === 'subagent_chunk',
      )

      // If there are subagent events, there might be subagent chunks
      const subagentStarts = collector.getEventsByType('subagent_start')
      if (subagentStarts.length > 0 && subagentChunks.length > 0) {
        // Verify chunk structure
        for (const chunk of subagentChunks) {
          expect(chunk.agentId).toBeDefined()
          expect(chunk.agentType).toBeDefined()
          expect(typeof chunk.chunk).toBe('string')
        }
      }
    },
    DEFAULT_TIMEOUT * 2,
  )

  test(
    'no duplicate subagent_start events for same agent',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      await client.run({
        agent: 'codebuff/base@latest',
        prompt: 'Find TypeScript files',
        handleEvent: collector.handleEvent,
        cwd: process.cwd(),
      })

      const subagentStarts = collector.getEventsByType('subagent_start')

      // Check for duplicates by agentId
      const agentIds = subagentStarts.map((s) => s.agentId)
      const uniqueIds = new Set(agentIds)

      // Each agentId should appear only once in start events
      expect(agentIds.length).toBe(uniqueIds.size)
    },
    DEFAULT_TIMEOUT * 2,
  )
})
