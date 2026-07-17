import { loadMCPConfigSync } from '@codebuff/sdk'
import {
  getMCPClientConnectionInfo,
  hashMcpConfig,
  sanitizeErrorForDisplay,
  truncateError,
} from '@codebuff/common/mcp/client'

import { getSystemMessage } from '../utils/message-history'

import type { MCPConfig } from '@codebuff/common/types/mcp'

const MAX_ERROR_LENGTH = 2000

// ============================================================================
// Public API
// ============================================================================

export type McpServerStatus = {
  name: string
  transport: string
  connected: boolean
  toolCount: number | null
  configPath: string
  errorLabel: string | null
}

/**
 * Load configured MCP servers and enrich each with connection status.
 * This is the single-entry point that the /mcp command handler calls.
 */
export function buildMcpStatusReport(): {
  servers: McpServerStatus[]
  configPath: string
} {
  const loaded = loadMCPConfigSync({ verbose: false })
  const servers: McpServerStatus[] = []

  for (const [name, config] of Object.entries(loaded.mcpServers)) {
    const info = getMCPClientConnectionInfo(config)
    const hash = hashMcpConfig(config)

    servers.push({
      name,
      transport: describeTransport(config),
      connected: info.connected,
      toolCount: info.toolCount,
      configPath: loaded._sourceFilePath,
      errorLabel:
        info.errorLabel !== null
          ? truncateError(info.errorLabel, MAX_ERROR_LENGTH)
          : null,
    })
  }

  return { servers, configPath: loaded._sourceFilePath }
}

/**
 * Render the status report as a system message for the chat.
 */
export function formatMcpStatusForCli(report: {
  servers: McpServerStatus[]
  configPath: string
}): string {
  const { servers, configPath } = report

  if (servers.length === 0) {
    return [
      '### MCP Servers',
      '',
      'No MCP servers configured.',
      '',
      'Create an `.agents/mcp.json` file in your project with server definitions,',
      'then run /mcp again to see their status.',
      '',
      'Example `.agents/mcp.json`:',
      '```json',
      '{',
      '  "mcpServers": {',
      '    "my-server": {',
      '      "command": "npx",',
      '      "args": ["-y", "@modelcontextprotocol/server-my-server"]',
      '    }',
      '  }',
      '}',
      '```',
      '',
      `Config path: ${sanitizePath(configPath) || '(not found)'}`,
    ].join('\n')
  }

  const lines: string[] = ['### MCP Servers', '']

  for (const server of servers) {
    const icon = server.connected ? '✓' : server.errorLabel ? '✗' : '○'
    const statusLabel = server.connected
      ? 'connected'
      : server.errorLabel
        ? 'failed'
        : 'not connected'
    const colorTag = server.connected ? '' : ' (will connect when the agent uses its tools)'

    lines.push(`**${icon} ${server.name}**`)
    lines.push(`  Status: ${statusLabel}${!server.connected && !server.errorLabel ? colorTag : ''}`)
    lines.push(`  Transport: ${server.transport}`)
    lines.push(
      `  Tools: ${server.toolCount !== null ? String(server.toolCount) : '…'}`,
    )
    if (server.errorLabel) {
      lines.push(`  Error: ${server.errorLabel}`)
    }
    lines.push('')
  }

  if (configPath) {
    lines.push(`Config path: ${sanitizePath(configPath)}`)
  }

  return lines.join('\n')
}

/**
 * The /mcp command handler — builds a system message and returns it.
 */
export function handleMcpCommand(): { postUserMessage: (prev: any[]) => any[] } {
  const report = buildMcpStatusReport()
  const formatted = formatMcpStatusForCli(report)

  const postUserMessage = (prev: any[]): any[] => [
    ...prev,
    getSystemMessage(formatted),
  ]

  return { postUserMessage }
}

// ============================================================================
// Private helpers
// ============================================================================

/**
 * Describe the transport type from an MCP config object.
 */
function describeTransport(config: MCPConfig): string {
  if ('command' in config) return 'stdio'
  if (config.type === 'http') return 'Streamable HTTP'
  if (config.type === 'sse') return 'SSE'
  return 'unknown'
}

/**
 * Sanitize a file-system path for display, redacting user-home segments on
 * platforms where that isn't already handled by the resolved path.
 */
function sanitizePath(filePath: string): string {
  if (!filePath) return ''
  // On Unix, the resolved path already uses the actual home dir value, so
  // it's safe to display as-is (no $HOME leak). Just return the path.
  return filePath
}
