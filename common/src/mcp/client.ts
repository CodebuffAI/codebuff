import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import { getErrorObject } from '../util/error'
import { MCPClientPool, withTimeout } from './client-pool'

import type { MCPConfig } from '../types/mcp'
import type { ToolResultOutput } from '../types/messages/content-part'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type {
  BlobResourceContents,
  CallToolResult,
  TextResourceContents,
} from '@modelcontextprotocol/sdk/types.js'

// Cap on how much of a failed stdio server's stderr we retain for the error
// message — enough to show the real failure without unbounded growth.
const STDERR_BUFFER_CAP = 8192

const LIST_TOOLS_TIMEOUT_MS = 30_000
const CALL_TOOL_TIMEOUT_MS = 120_000
const listToolsCache = new Map<
  string,
  ReturnType<typeof Client.prototype.listTools>
>()

/**
 * Substitutes environment variable references ($VAR_NAME) in a string with their values.
 * Supports both simple replacement ("$VAR_NAME") and interpolation ("Bearer $VAR_NAME").
 */
function substituteEnvInValue(value: string): string {
  return value.replace(/\$([A-Z_][A-Z0-9_]*)/g, (match, varName) => {
    const envValue = process.env[varName]
    if (envValue === undefined) {
      // Return original if env var not found
      return match
    }
    return envValue
  })
}

/**
 * Substitutes environment variable references in all values of a record.
 */
function substituteEnvInRecord(
  record: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(record)) {
    result[key] = substituteEnvInValue(value)
  }
  return result
}

function hashConfig(config: MCPConfig): string {
  if (config.type === 'stdio') {
    return JSON.stringify({
      command: config.command,
      args: config.args,
      env: config.env,
    })
  }
  if (config.type === 'http') {
    return JSON.stringify({
      type: 'http',
      url: config.url,
      params: config.params,
    })
  }
  if (config.type === 'sse') {
    return JSON.stringify({
      type: 'sse',
      url: config.url,
      params: config.params,
    })
  }
  config.type satisfies never
  throw new Error(
    `Internal error in hashConfig: invalid MCP config type ${config.type}`,
  )
}

async function connectMCPClient(config: MCPConfig): Promise<Client> {
  let transport: Transport
  // Buffer the child process's stderr so that a server which crashes during
  // startup produces an actionable error instead of the opaque MCP SDK message
  // "MCP error -32000: Connection closed".
  let stderrBuffer = ''
  if (config.type === 'stdio') {
    const stdioTransport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: substituteEnvInRecord(config.env),
      stderr: 'pipe',
    })
    // When stderr is 'pipe' the SDK exposes a PassThrough immediately (before
    // the process is spawned), so attaching here captures even early output
    // from a child that dies during the connection handshake.
    stdioTransport.stderr?.on('data', (chunk: Buffer) => {
      if (stderrBuffer.length < STDERR_BUFFER_CAP) {
        stderrBuffer += chunk.toString('utf8')
      }
    })
    transport = stdioTransport
  } else {
    const url = new URL(config.url)
    for (const [key, value] of Object.entries(config.params)) {
      url.searchParams.set(key, value)
    }
    const headers = substituteEnvInRecord(config.headers)
    if (config.type === 'http') {
      transport = new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers,
        },
      })
    } else if (config.type === 'sse') {
      transport = new SSEClientTransport(url, {
        requestInit: {
          headers,
        },
      })
    } else {
      config.type satisfies never
      throw new Error(`Internal error: invalid MCP config type ${config.type}`)
    }
  }

  const client = new Client({
    name: 'codebuff',
    version: '1.0.0',
  })

  try {
    await client.connect(transport)
  } catch (error) {
    const baseMessage = getErrorObject(error).message
    if (config.type === 'stdio') {
      const commandStr = [config.command, ...(config.args ?? [])].join(' ')
      const detail = stderrBuffer.trim()
      throw new Error(
        `${baseMessage}. Failed to start MCP server via \`${commandStr}\`. ` +
          `Ensure the command is installed and runnable (e.g. an up-to-date ` +
          `node/npm/npx, or python/uvx) and that any required env vars are set.` +
          (detail ? `\nServer stderr:\n${detail}` : ''),
      )
    }
    throw new Error(
      `${baseMessage}. Failed to connect to MCP server at ${config.url}.`,
    )
  }
  return client
}

export function getMCPClientId(config: MCPConfig): string {
  return hashConfig(config)
}

const clientPool = new MCPClientPool<Client, MCPConfig>({
  keyOf: hashConfig,
  connect: connectMCPClient,
  close: async (client) => client.close(),
})

export async function getMCPClient(config: MCPConfig): Promise<string> {
  return (await clientPool.get(config)).id
}

export type MCPClientStatus = ReturnType<typeof clientPool.statuses>[number]

export function getMCPClientStatuses(): MCPClientStatus[] {
  return clientPool.statuses()
}

export async function closeMCPClient(clientId: string): Promise<boolean> {
  listToolsCache.delete(clientId)
  return clientPool.close(clientId)
}

export async function closeAllMCPClients(): Promise<void> {
  listToolsCache.clear()
  await clientPool.closeAll()
}

export async function reloadMCPClient(config: MCPConfig): Promise<string> {
  const clientId = hashConfig(config)
  await closeMCPClient(clientId)
  return getMCPClient(config)
}

export function listMCPTools(
  clientId: string,
  ...args: Parameters<typeof Client.prototype.listTools>
): ReturnType<typeof Client.prototype.listTools> {
  const client = clientPool.getReady(clientId)
  if (!client) {
    throw new Error(`listTools: client not found with id: ${clientId}`)
  }
  const cached = listToolsCache.get(clientId)
  if (cached) return cached

  const request = withTimeout(
    client.listTools(...args),
    LIST_TOOLS_TIMEOUT_MS,
    `MCP listTools timed out after ${LIST_TOOLS_TIMEOUT_MS}ms`,
  ) as ReturnType<typeof Client.prototype.listTools>
  listToolsCache.set(clientId, request)
  request.catch(() => {
    if (listToolsCache.get(clientId) === request) {
      listToolsCache.delete(clientId)
    }
  })
  return request
}

function getResourceData(
  resource: TextResourceContents | BlobResourceContents,
): string {
  if ('text' in resource) return resource.text as string
  if ('blob' in resource) return resource.blob as string
  return ''
}

export async function callMCPTool(
  clientId: string,
  ...args: Parameters<typeof Client.prototype.callTool>
): Promise<ToolResultOutput[]> {
  const client = clientPool.getReady(clientId)
  if (!client) {
    throw new Error(`callTool: client not found with id: ${clientId}`)
  }
  const callResult = await withTimeout(
    client.callTool(...args),
    CALL_TOOL_TIMEOUT_MS,
    `MCP callTool timed out after ${CALL_TOOL_TIMEOUT_MS}ms`,
  )
  const result = callResult as CallToolResult
  const content = result.content

  return content.map((c: (typeof content)[number]) => {
    if (c.type === 'text') {
      return {
        type: 'json',
        value: c.text,
      } satisfies ToolResultOutput
    }
    if (c.type === 'audio') {
      return {
        type: 'media',
        data: c.data,
        mediaType: c.mimeType,
      } satisfies ToolResultOutput
    }
    if (c.type === 'image') {
      return {
        type: 'media',
        data: c.data,
        mediaType: c.mimeType,
      } satisfies ToolResultOutput
    }
    if (c.type === 'resource') {
      return {
        type: 'media',
        data: getResourceData(c.resource),
        mediaType: c.resource.mimeType ?? 'text/plain',
      } satisfies ToolResultOutput
    }
    const fallbackValue =
      'uri' in c && typeof (c as { uri: unknown }).uri === 'string'
        ? (c as { uri: string }).uri
        : JSON.stringify(c)
    return {
      type: 'json',
      value: fallbackValue,
    } satisfies ToolResultOutput
  })
}
