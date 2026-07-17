import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { findCommand } from '../command-registry'
import {
  buildMcpStatusReport,
  formatMcpStatusForCli,
  handleMcpCommand,
} from '../mcp-command'

import type { RouterParams } from '../command-registry'
import type { ChatMessage } from '../../types/chat'

// ============================================================================
// Helmock module for loadMCPConfigSync
// ============================================================================
let mockMcpConfig: any = { mcpServers: {}, _sourceFilePath: '' }

mock.module('@codebuff/sdk', () => {
  const actual = require('@codebuff/sdk') as any
  return {
    ...actual,
    loadMCPConfigSync: () => mockMcpConfig,
  }
})

// ============================================================================
// Tests
// ============================================================================

describe('/mcp command registration', () => {
  test('findCommand finds /mcp', () => {
    const command = findCommand('mcp')
    expect(command).toBeDefined()
    expect(command!.name).toBe('mcp')
  })

  test('findCommand finds mcp via alias', () => {
    const command = findCommand('mcp-servers')
    expect(command).toBeDefined()
    expect(command!.name).toBe('mcp')
  })

  test('command is defined with defineCommand (no args)', () => {
    const command = findCommand('mcp')
    expect(command!.acceptsArgs).toBe(false)
  })

  test('command handler renders a system message via handleMcpCommand', () => {
    mockMcpConfig = { mcpServers: {}, _sourceFilePath: '' }
    const { postUserMessage } = handleMcpCommand()
    const prev: any[] = [{ id: '1', variant: 'user', content: '/mcp', timestamp: '' }]
    const result = postUserMessage(prev)

    expect(result).toHaveLength(2)
    const systemMsg = result[1]
    expect(systemMsg.variant).toBe('ai')
    expect(systemMsg.content).toContain('MCP')
  })
})

describe('buildMcpStatusReport', () => {
  beforeEach(() => {
    mockMcpConfig = { mcpServers: {}, _sourceFilePath: '' }
  })

  test('no servers configured', () => {
    mockMcpConfig = { mcpServers: {}, _sourceFilePath: '' }
    const report = buildMcpStatusReport()
    expect(report.servers).toEqual([])
    expect(report.configPath).toBe('')
  })

  test('one stdio server configured (not connected)', () => {
    mockMcpConfig = {
      mcpServers: {
        github: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: {},
        },
      },
      _sourceFilePath: '/project/.agents/mcp.json',
    }

    const report = buildMcpStatusReport()
    expect(report.servers).toHaveLength(1)
    expect(report.servers[0].name).toBe('github')
    expect(report.servers[0].transport).toBe('stdio')
    expect(report.servers[0].connected).toBe(false)
    expect(report.servers[0].toolCount).toBeNull()
    expect(report.servers[0].errorLabel).toBeNull()
  })

  test('multiple servers configured', () => {
    mockMcpConfig = {
      mcpServers: {
        github: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: {},
        },
        postgres: {
          type: 'stdio',
          command: 'uvx',
          args: ['mcp-server-postgres'],
          env: {},
        },
      },
      _sourceFilePath: '/project/.agents/mcp.json',
    }

    const report = buildMcpStatusReport()
    expect(report.servers).toHaveLength(2)

    const github = report.servers.find((s) => s.name === 'github')!
    expect(github).toBeDefined()
    expect(github.transport).toBe('stdio')

    const postgres = report.servers.find((s) => s.name === 'postgres')!
    expect(postgres).toBeDefined()
    expect(postgres.transport).toBe('stdio')
  })

  test('config file with http transport', () => {
    mockMcpConfig = {
      mcpServers: {
        remote: {
          type: 'http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer token' },
          params: {},
        },
      },
      _sourceFilePath: '/project/.agents/mcp.json',
    }

    const report = buildMcpStatusReport()
    expect(report.servers).toHaveLength(1)
    expect(report.servers[0].transport).toBe('Streamable HTTP')
  })

  test('config file with sse transport', () => {
    mockMcpConfig = {
      mcpServers: {
        events: {
          type: 'sse',
          url: 'https://events.example.com/mcp',
          params: {},
          headers: {},
        },
      },
      _sourceFilePath: '/project/.agents/mcp.json',
    }

    const report = buildMcpStatusReport()
    expect(report.servers).toHaveLength(1)
    expect(report.servers[0].transport).toBe('SSE')
  })
})

describe('formatMcpStatusForCli', () => {
  test('empty config shows helpful message', () => {
    const output = formatMcpStatusForCli({ servers: [], configPath: '' })
    expect(output).toContain('No MCP servers configured')
    expect(output).toContain('.agents/mcp.json')
    expect(output).not.toContain('✓')
    expect(output).not.toContain('✗')
  })

  test('single connected server', () => {
    const output = formatMcpStatusForCli({
      servers: [
        {
          name: 'github',
          transport: 'stdio',
          connected: true,
          toolCount: 18,
          configPath: '/project/.agents/mcp.json',
          errorLabel: null,
        },
      ],
      configPath: '/project/.agents/mcp.json',
    })
    expect(output).toContain('✓')
    expect(output).toContain('github')
    expect(output).toContain('connected')
    expect(output).toContain('stdio')
    expect(output).toContain('18')
    expect(output).toContain('Config path')
  })

  test('multiple servers with mixed status', () => {
    const output = formatMcpStatusForCli({
      servers: [
        {
          name: 'github',
          transport: 'stdio',
          connected: true,
          toolCount: 18,
          configPath: '/project/.agents/mcp.json',
          errorLabel: null,
        },
        {
          name: 'postgres',
          transport: 'stdio',
          connected: false,
          toolCount: null,
          configPath: '/project/.agents/mcp.json',
          errorLabel: null,
        },
      ],
      configPath: '/project/.agents/mcp.json',
    })
    expect(output).toContain('✓ github')
    expect(output).toContain('○ postgres')
    expect(output).toContain('not connected')
    expect(output).toContain('will connect when the agent uses its tools')
  })

  test('failed server with error', () => {
    const output = formatMcpStatusForCli({
      servers: [
        {
          name: 'broken',
          transport: 'stdio',
          connected: false,
          toolCount: null,
          configPath: '/project/.agents/mcp.json',
          errorLabel: 'process exited before initialization',
        },
      ],
      configPath: '/project/.agents/mcp.json',
    })
    expect(output).toContain('✗')
    expect(output).toContain('broken')
    expect(output).toContain('failed')
    expect(output).toContain('process exited before initialization')
  })

  test('unknown transport', () => {
    const output = formatMcpStatusForCli({
      servers: [
        {
          name: 'weird',
          transport: 'unknown',
          connected: false,
          toolCount: null,
          configPath: '/project/.agents/mcp.json',
          errorLabel: null,
        },
      ],
      configPath: '/project/.agents/mcp.json',
    })
    expect(output).toContain('weird')
    expect(output).toContain('unknown')
  })

  test('tool count shows ellipsis when null', () => {
    const output = formatMcpStatusForCli({
      servers: [
        {
          name: 'github',
          transport: 'stdio',
          connected: true,
          toolCount: null,
          configPath: '/project/.agents/mcp.json',
          errorLabel: null,
        },
      ],
      configPath: '/project/.agents/mcp.json',
    })
    expect(output).toContain('Tools: …')
  })
})

describe('/mcp command does not break other commands', () => {
  test('help command still works', () => {
    const help = findCommand('help')
    expect(help).toBeDefined()
    expect(help!.name).toBe('help')
  })

  test('bash command still works', () => {
    const bash = findCommand('bash')
    expect(bash).toBeDefined()
    expect(bash!.name).toBe('bash')
  })

  test('history command still works', () => {
    const history = findCommand('history')
    expect(history).toBeDefined()
    expect(history!.name).toBe('history')
  })

  test('init command still works', () => {
    const init = findCommand('init')
    expect(init).toBeDefined()
    expect(init!.name).toBe('init')
  })

  test('theme:toggle command still works', () => {
    const theme = findCommand('theme:toggle')
    expect(theme).toBeDefined()
    expect(theme!.name).toBe('theme:toggle')
  })

  test('feedback command still works', () => {
    const fb = findCommand('feedback')
    expect(fb).toBeDefined()
    expect(fb!.name).toBe('feedback')
  })
})
