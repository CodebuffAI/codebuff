import { cloneDeep } from 'lodash'

import { codebuffToolDefs } from './definitions/list'

import type { ToolName } from '@codebuff/common/tools/constants'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { ToolSet } from 'ai'

export async function getToolSet(params: {
  toolNames: string[]
  additionalToolDefinitions: () => Promise<
    ProjectFileContext['customToolDefinitions']
  >
}): Promise<ToolSet> {
  const { toolNames, additionalToolDefinitions } = params

  const toolSet: ToolSet = {}
  for (const toolName of toolNames) {
    if (toolName in codebuffToolDefs) {
      toolSet[toolName] = codebuffToolDefs[toolName as ToolName]
    }
  }
  const toolDefinitions = await additionalToolDefinitions()
  for (const [toolName, toolDef] of Object.entries(toolDefinitions)) {
    toolSet[toolName] = cloneDeep(toolDef)
  }

  return toolSet
}
