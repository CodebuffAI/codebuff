import path from 'path'

import { afterEach, describe, expect, it } from 'bun:test'

import {
  callMCPTool,
  closeAllMCPClients,
  getMCPClient,
  getMCPClientStatuses,
  listMCPTools,
} from '../client'

afterEach(async () => {
  await closeAllMCPClients()
})

describe('MCP client end to end', () => {
  it('discovers and calls a stdio tool through the managed pool', async () => {
    const fixture = path.join(import.meta.dir, 'fixtures', 'echo-server.ts')
    const clientId = await getMCPClient({
      type: 'stdio',
      command: process.execPath,
      args: [fixture],
      env: {},
    })

    const tools = await listMCPTools(clientId)
    const output = await callMCPTool(clientId, {
      name: 'echo',
      arguments: { text: 'mcp-ok' },
    })

    expect(tools.tools.map((tool) => tool.name)).toContain('echo')
    expect(output).toEqual([{ type: 'json', value: 'echo:mcp-ok' }])
    expect(getMCPClientStatuses()[0]?.state).toBe('ready')
  })
})
