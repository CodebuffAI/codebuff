import {
  closeAllMCPClients,
  getMCPClient,
  getMCPClientId,
  getMCPClientStatuses,
  listMCPTools,
} from '@codebuff/common/mcp/client'

import {
  getLoadedMCPServers,
  initializeAgentRegistry,
} from '../utils/local-agent-registry'

import type { MCPConfig } from '@codebuff/common/types/mcp'

function describeConfig(config: MCPConfig): string {
  if (config.type === 'stdio') return `stdio · ${config.command}`
  try {
    const url = new URL(config.url)
    return `${config.type} · ${url.origin}${url.pathname}`
  } catch {
    return `${config.type} · endereço inválido`
  }
}

export function formatMCPStatus(): string {
  const servers = getLoadedMCPServers()
  const statuses = getMCPClientStatuses()
  if (!Object.keys(servers).length) {
    return 'Nenhum servidor MCP configurado. Use .agents/mcp.json, .mcp.json ou .cursor/mcp.json.'
  }

  const readyIds = new Set(
    statuses.filter((status) => status.state === 'ready').map((status) => status.id),
  )
  return Object.entries(servers)
    .map(([name, config]) => {
      const active = readyIds.has(getMCPClientId(config))
        ? 'conectado'
        : 'configurado'
      return `${name} · ${describeConfig(config)} · ${active}`
    })
    .join('\n')
}

export async function runMCPCommand(args: string): Promise<string> {
  const trimmed = args.trim()
  const [verb, name] = trimmed ? trimmed.split(/\s+/, 2) : ['status']
  if (verb === 'status' || verb === 'list') return formatMCPStatus()

  if (verb === 'reload') {
    await closeAllMCPClients()
    await initializeAgentRegistry()
    return `MCP recarregado.\n${formatMCPStatus()}`
  }

  if (verb === 'test') {
    if (!name) return 'Uso: /mcp test <servidor>'
    const config = getLoadedMCPServers()[name]
    if (!config) return `Servidor MCP não encontrado: ${name}`
    try {
      const clientId = await getMCPClient(config)
      const result = await listMCPTools(clientId)
      return `${name} conectado · ${result.tools.length} ferramentas disponíveis`
    } catch (error) {
      return `${name} falhou: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  return 'Uso: /mcp [status|list|reload|test <servidor>]'
}
