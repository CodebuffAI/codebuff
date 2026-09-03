import { describe, test, expect } from 'bun:test'
import { z } from 'zod/v4'

import { getMCPToolData } from '../mcp'
import { MCP_TOOL_SEPARATOR } from '../mcp-constants'

describe('getMCPToolData schema storage (the bug: live zod in persisted state)', () => {
  test('stores the server JSON Schema verbatim, JSON-serializable by contract', async () => {
    const serverSchema = {
      type: 'object',
      properties: {
        location: { type: 'string', enum: ['NYC', 'LA'] },
        units: { type: 'string', description: 'metric or imperial' },
      },
      required: ['location'],
    }
    const writeTo: Record<string, any> = {}
    await getMCPToolData({
      toolNames: ['weather/get_forecast'],
      mcpServers: {
        weather: { command: 'echo', args: [] },
      } as never,
      writeTo: writeTo as never,
      requestMcpToolData: async () => [
        {
          name: 'get_forecast',
          description: 'Get the forecast',
          inputSchema: serverSchema,
        },
      ],
    })

    const stored = writeTo[`weather${MCP_TOOL_SEPARATOR}get_forecast`]
    expect(stored).toBeDefined()

    // THE CONTRACT: tool definitions are persisted, snapshotted, and shipped
    // over the wire every turn, so the stored schema must round-trip JSON as
    // the exact schema the server sent. Storing a live zod instance here
    // instead serializes zod internals (def/shape) and can carry cycles that
    // detonate JSON.stringify over the whole run state ("cannot serialize
    // cyclic structures", session death from turn 2 onward).
    const roundTripped = JSON.parse(JSON.stringify(stored.inputSchema))
    expect(roundTripped).toEqual(serverSchema)
  })

  test('stores schemas for multiple tools and servers without conversion', async () => {
    const schemaA = { type: 'object', properties: { a: { type: 'number' } } }
    const schemaB = { type: 'string' }
    const writeTo: Record<string, any> = {}
    await getMCPToolData({
      toolNames: [],
      mcpServers: {
        alpha: { command: 'echo', args: [] },
        beta: { command: 'echo', args: [] },
      } as never,
      writeTo: writeTo as never,
      requestMcpToolData: async ({ toolNames }: { toolNames: unknown }) => {
        void toolNames
        return [
          { name: 't1', description: 'A', inputSchema: schemaA },
          { name: 't2', description: 'B', inputSchema: schemaB },
        ]
      },
    })

    for (const [server, schema] of [
      ['alpha', schemaA],
      ['beta', schemaB],
    ] as const) {
      const toolName = server === 'alpha' ? 't1' : 't2'
      const stored = writeTo[`${server}${MCP_TOOL_SEPARATOR}${toolName}`]
      expect(JSON.parse(JSON.stringify(stored.inputSchema))).toEqual(schema)
    }
    expect(writeTo[`beta${MCP_TOOL_SEPARATOR}t2`].description).toBe('B')
  })

  test('a zod schema stored in state is the failure mode this guards against', () => {
    // Documents what the old code did: storing convertJsonSchemaToZod output
    // in state. It round-trips to garbage, not the server's schema.
    const serverSchema = { type: 'object', properties: { q: { type: 'string' } } }
    const zodInstance = z.object({ q: z.string() })
    const roundTripped = JSON.parse(JSON.stringify(zodInstance))
    expect(roundTripped).not.toEqual(serverSchema)
    expect(roundTripped.def).toBeDefined() // zod internals leaked into state
  })
})
