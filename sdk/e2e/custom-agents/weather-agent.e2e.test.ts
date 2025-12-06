/**
 * E2E Test: Weather Agent
 *
 * Custom agent with a get_weather custom tool demonstrating custom tool integration.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { z } from 'zod/v4'

import { CodebuffClient, getCustomToolDefinition } from '../../src'
import { EventCollector, getApiKey, skipIfNoApiKey, isAuthError, MOCK_WEATHER_DATA, DEFAULT_TIMEOUT } from '../utils'

import type { AgentDefinition } from '../../src'

describe('Custom Agents: Weather Agent', () => {
  let client: CodebuffClient

  const weatherAgent: AgentDefinition = {
    id: 'weather-agent',
    model: 'anthropic/claude-sonnet-4-20250514',
    displayName: 'Weather Agent',
    toolNames: ['get_weather'],
    instructionsPrompt: `You are a helpful weather assistant. 
When asked about weather, use the get_weather tool to fetch current conditions.
Always report the temperature and conditions clearly.`,
  }

  const weatherTool = getCustomToolDefinition({
    toolName: 'get_weather',
    description: 'Get current weather for a city',
    inputSchema: z.object({
      city: z.string().describe('Name of the city'),
    }),
    exampleInputs: [{ city: 'New York' }],
    execute: async ({ city }) => {
      const weather = MOCK_WEATHER_DATA[city] || { temp: 65, condition: 'Unknown' }
      return [
        {
          type: 'json' as const,
          value: {
            city,
            temperature: weather.temp,
            condition: weather.condition,
            unit: 'fahrenheit',
          },
        },
      ]
    },
  })

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'custom weather tool is called and returns data',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: 'weather-agent',
        prompt: 'What is the weather in New York?',
        agentDefinitions: [weatherAgent],
        customToolDefinitions: [weatherTool],
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')

      // Check that the tool was called
      const toolCalls = collector.getEventsByType('tool_call')
      const weatherCalls = toolCalls.filter((c) => c.toolName === 'get_weather')

      expect(weatherCalls.length).toBeGreaterThan(0)

      // Response should mention temperature or weather
      const responseText = collector.getFullText().toLowerCase()
      expect(
        responseText.includes('72') ||
          responseText.includes('sunny') ||
          responseText.includes('temperature') ||
          responseText.includes('weather'),
      ).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'custom tool handles unknown city gracefully',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: 'weather-agent',
        prompt: 'What is the weather in Atlantis?',
        agentDefinitions: [weatherAgent],
        customToolDefinitions: [weatherTool],
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')
      expect(collector.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )
})
