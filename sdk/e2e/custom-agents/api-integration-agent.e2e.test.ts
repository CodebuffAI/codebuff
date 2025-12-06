/**
 * E2E Test: API Integration Agent
 *
 * Agent that fetches from external APIs demonstrating API integration patterns.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { z } from 'zod/v4'

import { CodebuffClient, getCustomToolDefinition } from '../../src'
import { EventCollector, getApiKey, skipIfNoApiKey, isAuthError, DEFAULT_TIMEOUT } from '../utils'

import type { AgentDefinition } from '../../src'

describe('Custom Agents: API Integration Agent', () => {
  let client: CodebuffClient

  const apiAgent: AgentDefinition = {
    id: 'api-agent',
    model: 'anthropic/claude-sonnet-4-20250514',
    displayName: 'API Integration Agent',
    toolNames: ['fetch_api'],
    instructionsPrompt: `You are an API integration assistant.
Use the fetch_api tool to make HTTP requests.
Summarize the response data clearly.`,
  }

  const fetchTool = getCustomToolDefinition({
    toolName: 'fetch_api',
    description: 'Fetch data from an API endpoint',
    inputSchema: z.object({
      url: z.string().describe('URL to fetch'),
      method: z.enum(['GET', 'POST']).default('GET'),
    }),
    exampleInputs: [{ url: 'https://api.example.com/data', method: 'GET' }],
    execute: async ({ url, method }) => {
      // Mock responses for common test URLs
      if (url.includes('jsonplaceholder') || url.includes('example')) {
        return [
          {
            type: 'json' as const,
            value: {
              status: 200,
              data: {
                id: 1,
                title: 'Mock Response',
                body: 'This is mock API data for testing',
              },
            },
          },
        ]
      }

      // Try real fetch for other URLs (with timeout)
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(url, {
          method,
          signal: controller.signal,
        })
        clearTimeout(timeout)

        const text = await response.text()
        return [
          {
            type: 'json' as const,
            value: {
              status: response.status,
              data: text.slice(0, 1000),
            },
          },
        ]
      } catch {
        return [
          {
            type: 'json' as const,
            value: {
              error: 'Failed to fetch',
              status: 0,
            },
          },
        ]
      }
    },
  })

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'fetches mock API data and summarizes response',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: 'api-agent',
        prompt: 'Fetch data from https://jsonplaceholder.typicode.com/posts/1',
        agentDefinitions: [apiAgent],
        customToolDefinitions: [fetchTool],
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')

      const toolCalls = collector.getEventsByType('tool_call')
      expect(toolCalls.some((c) => c.toolName === 'fetch_api')).toBe(true)

      expect(collector.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'handles API errors gracefully',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: 'api-agent',
        prompt: 'Try to fetch data from https://nonexistent-domain-12345.invalid/api',
        agentDefinitions: [apiAgent],
        customToolDefinitions: [fetchTool],
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      // Should complete without crashing
      expect(collector.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )
})
