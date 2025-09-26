import { requestMcpToolData } from '../websockets/websocket-action'

import type { AgentTemplate } from '../templates/types'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

export async function getMCPToolData({
  ws,
  toolNames,
  mcpServers,
  writeTo,
}: {
  ws: WebSocket
  toolNames: AgentTemplate['toolNames']
  mcpServers: AgentTemplate['mcpServers']
  writeTo: ProjectFileContext['customToolDefinitions']
}): Promise<ProjectFileContext['customToolDefinitions']> {
  const requestedToolsByMcp: Record<string, string[] | undefined> = {}
  for (const t of toolNames) {
    if (!t.includes('/')) {
      continue
    }
    const [mcpName, ...remaining] = t.split('/')
    const toolName = remaining.join('/')
    if (!requestedToolsByMcp[mcpName]) {
      requestedToolsByMcp[mcpName] = []
    }
    requestedToolsByMcp[mcpName].push(toolName)
  }

  writeTo ??= {}
  const promises: Promise<any>[] = []
  for (const [mcpName, mcpConfig] of Object.entries(mcpServers)) {
    promises.push(
      (async () => {
        const mcpData = await requestMcpToolData({
          ws,
          mcpConfig,
          toolNames: requestedToolsByMcp[mcpName] ?? null,
        })

        for (const { name, description, inputSchema } of mcpData) {
          writeTo[mcpName + '/' + name] = {
            inputJsonSchema: inputSchema,
            endsAgentStep: true,
            description,
          }
        }
      })(),
    )
  }
  await Promise.all(promises)

  return writeTo
}
