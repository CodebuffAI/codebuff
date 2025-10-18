import type { AgentTemplate } from './templates/types'
import type { RequestMcpToolDataFn } from '@codebuff/common/types/contracts/client'
import type { OptionalFields } from '@codebuff/common/types/function-params'
import type { ProjectFileContext } from '@codebuff/common/util/file'

export async function getMCPToolData(
  params: OptionalFields<
    {
      toolNames: AgentTemplate['toolNames']
      mcpServers: AgentTemplate['mcpServers']
      writeTo: ProjectFileContext['customToolDefinitions']
      requestMcpToolData: RequestMcpToolDataFn
    },
    'writeTo'
  >,
): Promise<ProjectFileContext['customToolDefinitions']> {
  const withDefaults = { writeTo: {}, ...params }
  const { toolNames, mcpServers, writeTo, requestMcpToolData } = withDefaults

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

  const promises: Promise<any>[] = []
  for (const [mcpName, mcpConfig] of Object.entries(mcpServers)) {
    promises.push(
      (async () => {
        const mcpData = await requestMcpToolData({
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
