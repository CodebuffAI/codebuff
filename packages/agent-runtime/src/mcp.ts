import { convertJsonSchemaToZod } from 'zod-from-json-schema'

import { MCP_TOOL_SEPARATOR } from './mcp-constants'

import type { AgentTemplate } from './templates/types'
import type { RequestMcpToolDataFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { OptionalFields } from '@codebuff/common/types/function-params'
import type {
  CustomToolDefinitions,
  ProjectFileContext,
} from '@codebuff/common/util/file'

export async function getMCPToolData(
  params: OptionalFields<
    {
      toolNames: AgentTemplate['toolNames']
      mcpServers: AgentTemplate['mcpServers']
      writeTo: ProjectFileContext['customToolDefinitions']
      requestMcpToolData: RequestMcpToolDataFn
      logger?: Logger
    },
    'writeTo'
  >,
): Promise<CustomToolDefinitions> {
  const withDefaults = { writeTo: {}, ...params }
  const { toolNames, mcpServers, writeTo, requestMcpToolData, logger } =
    withDefaults

  // User-facing toolNames use '/' as separator (e.g., 'supabase/list_tables')
  // but internally we use MCP_TOOL_SEPARATOR ('__') for LLM API compatibility
  const USER_INPUT_SEPARATOR = '/'
  const requestedToolsByMcp: Record<string, string[] | undefined> = {}
  for (const t of toolNames) {
    if (!t.includes(USER_INPUT_SEPARATOR)) {
      continue
    }
    const [mcpName, ...remaining] = t.split(USER_INPUT_SEPARATOR)
    const toolName = remaining.join(USER_INPUT_SEPARATOR)
    if (!requestedToolsByMcp[mcpName]) {
      requestedToolsByMcp[mcpName] = []
    }
    requestedToolsByMcp[mcpName].push(toolName)
  }

  // Load each MCP server's tools concurrently. Use allSettled so that a single
  // failing/unreachable server does not reject the whole batch and strip tools
  // from every healthy server — one bad server should only lose its own tools.
  const entries = Object.entries(mcpServers)
  const results = await Promise.allSettled(
    entries.map(async ([mcpName, mcpConfig]) => {
      const mcpData = await requestMcpToolData({
        mcpConfig,
        toolNames: requestedToolsByMcp[mcpName] ?? null,
      })

      for (const { name, description, inputSchema } of mcpData) {
        writeTo[mcpName + MCP_TOOL_SEPARATOR + name] = {
          inputSchema: convertJsonSchemaToZod(inputSchema as any) as any,
          endsAgentStep: true,
          description,
        }
      }
    }),
  )

  for (let i = 0; i < entries.length; i++) {
    const [mcpName] = entries[i]
    const outcome = results[i]
    if (outcome.status === 'rejected') {
      const reason =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason)
      logger?.warn(
        { mcpName, reason },
        `MCP server "${mcpName}" failed to load; its tools will be unavailable. Other MCP servers remain active.`,
      )
    }
  }

  return writeTo
}
