/**
 * E2E Test: Database Query Agent
 *
 * Agent with mock SQL execution tool demonstrating database integration patterns.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { z } from 'zod/v4'

import { CodebuffClient, getCustomToolDefinition } from '../../src'
import { EventCollector, getApiKey, skipIfNoApiKey, isAuthError, MOCK_DATABASE, DEFAULT_TIMEOUT } from '../utils'

import type { AgentDefinition } from '../../src'

describe('Custom Agents: Database Query Agent', () => {
  let client: CodebuffClient

  const dbAgent: AgentDefinition = {
    id: 'db-query-agent',
    model: 'anthropic/claude-sonnet-4-20250514',
    displayName: 'Database Query Agent',
    toolNames: ['execute_sql'],
    instructionsPrompt: `You are a database assistant. Use the execute_sql tool to query the database.
Available tables: users (id, name, email)
Always format query results in a readable way.`,
  }

  const sqlTool = getCustomToolDefinition({
    toolName: 'execute_sql',
    description: 'Execute a SQL query against the mock database',
    inputSchema: z.object({
      query: z.string().describe('SQL query to execute'),
    }),
    exampleInputs: [{ query: 'SELECT * FROM users' }],
    execute: async ({ query }) => {
      const lowerQuery = query.toLowerCase()

      // Simple mock SQL parser
      if (lowerQuery.includes('select') && lowerQuery.includes('users')) {
        const users = MOCK_DATABASE.users

        if (lowerQuery.includes('where')) {
          // Handle simple WHERE clauses
          const idMatch = query.match(/id\s*=\s*(\d+)/i)
          if (idMatch) {
            const id = parseInt(idMatch[1])
            const filtered = users.filter((u) => u.id === id)
            return [{ type: 'json' as const, value: { rows: filtered, rowCount: filtered.length } }]
          }
        }

        return [{ type: 'json' as const, value: { rows: users, rowCount: users.length } }]
      }

      return [{ type: 'json' as const, value: { error: 'Query not supported', rows: [], rowCount: 0 } }]
    },
  })

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'executes SELECT query and returns results',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: 'db-query-agent',
        prompt: 'Show me all users in the database',
        agentDefinitions: [dbAgent],
        customToolDefinitions: [sqlTool],
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')

      const toolCalls = collector.getEventsByType('tool_call')
      expect(toolCalls.some((c) => c.toolName === 'execute_sql')).toBe(true)

      const responseText = collector.getFullText().toLowerCase()
      expect(
        responseText.includes('alice') ||
          responseText.includes('bob') ||
          responseText.includes('user'),
      ).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'handles query with WHERE clause',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: 'db-query-agent',
        prompt: 'Find the user with id 1',
        agentDefinitions: [dbAgent],
        customToolDefinitions: [sqlTool],
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')
      expect(collector.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )
})
