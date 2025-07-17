import { CodebuffConfigSchema } from '@codebuff/common/json-config/constants'
import { stringifySchema } from '@codebuff/common/json-config/stringify-schema'
import {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'
import { z } from 'zod/v4'

import {
  getAgentInstructionsPrompt,
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from '../system-prompt/prompts'
import {
  getShortToolInstructions,
  getToolsInstructions,
} from '../tools'

import { renderToolResults, ToolName } from '@codebuff/common/constants/tools'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { generateCompactId } from '@codebuff/common/util/string'
import { agentTemplates } from './agent-list'
import {
  PLACEHOLDER,
  PlaceholderValue,
  placeholderValues,
  AgentTemplate,
} from './types'
import { agentRegistry } from './agent-registry'

// Local implementation since buildSpawnableAgentsDescription is not exported from tools
function buildSpawnableAgentsDescription(
  spawnableAgents: AgentTemplateType[]
): string {
  if (spawnableAgents.length === 0) {
    return ''
  }

  const schemaToJsonStr = (
    schema: any
  ) => {
    if (!schema) return 'None'
    try {
      if (schema instanceof z.ZodType) {
        const jsonSchema = z.toJSONSchema(schema)
        delete jsonSchema['$schema']
        return JSON.stringify(jsonSchema, null, 2)
      }
      return 'None'
    } catch (error) {
      return 'None'
    }
  }

  const agentsDescription = spawnableAgents
    .map((agentType) => {
      const agentTemplate =
        agentRegistry.getTemplate(agentType) || agentTemplates[agentType]
      if (!agentTemplate) {
        return `- ${agentType}: Dynamic agent (description not available)
prompt: {"description": "A coding task to complete", "type": "string"}
params: None`
      }
      const { promptSchema } = agentTemplate
      if (!promptSchema) {
        return `- ${agentType}: ${agentTemplate.description}
prompt: None
params: None`
      }
      const { prompt, params } = promptSchema
      return `- ${agentType}: ${agentTemplate.description}
prompt: ${schemaToJsonStr(prompt)}
params: ${schemaToJsonStr(params)}`
    })
    .filter(Boolean)
    .join('\n\n')

  return `\n\n## Spawnable Agents\n\nUse the spawn_agents tool to spawn subagents to help you complete the user request. Here are the available agents by their agent_type:\n\n${agentsDescription}`
}

export async function formatPrompt(
  prompt: string,
  fileContext: ProjectFileContext,
  agentState: AgentState,
  tools: ToolName[],
  spawnableAgents: AgentTemplateType[],
  intitialAgentPrompt?: string
): Promise<string> {
  // Handle structured prompt data
  let processedPrompt = intitialAgentPrompt ?? ''

  try {
    // Try to parse as JSON to extract structured data
    const promptData = JSON.parse(intitialAgentPrompt ?? '{}')
    if (typeof promptData === 'object' && promptData !== null) {
      // If it's structured data, extract the main prompt
      processedPrompt = promptData.prompt || intitialAgentPrompt || ''

      // Handle file paths for planner agent
      if (promptData.filePaths && Array.isArray(promptData.filePaths)) {
        processedPrompt += `\n\nRelevant files to consider:\n${promptData.filePaths.map((path: string) => `- ${path}`).join('\n')}`
      }
    }
  } catch {
    // If not JSON, use as-is
    processedPrompt = intitialAgentPrompt ?? ''
  }

  // Initialize agent registry to ensure dynamic agents are available
  await agentRegistry.initialize(fileContext)

  const toInject: Record<PlaceholderValue, string> = {
    [PLACEHOLDER.AGENT_NAME]: agentState.agentType
      ? agentRegistry.getAgentName(agentState.agentType) ||
        agentTemplates[agentState.agentType]?.name ||
        'Unknown Agent'
      : 'Buffy',
    [PLACEHOLDER.CONFIG_SCHEMA]: stringifySchema(CodebuffConfigSchema),
    [PLACEHOLDER.FILE_TREE_PROMPT]: getProjectFileTreePrompt(
      fileContext,
      20_000,
      'agent'
    ),
    [PLACEHOLDER.GIT_CHANGES_PROMPT]: getGitChangesPrompt(fileContext),
    [PLACEHOLDER.REMAINING_STEPS]: `${agentState.stepsRemaining!}`,
    [PLACEHOLDER.PROJECT_ROOT]: fileContext.projectRoot,
    [PLACEHOLDER.SYSTEM_INFO_PROMPT]: getSystemInfoPrompt(fileContext),
    [PLACEHOLDER.TOOLS_PROMPT]: getToolsInstructions(tools, spawnableAgents),
    [PLACEHOLDER.USER_CWD]: fileContext.cwd,
    [PLACEHOLDER.INITIAL_AGENT_PROMPT]: processedPrompt,
    [PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS]: renderToolResults(
      Object.entries({
        ...Object.fromEntries(
          Object.entries(fileContext.knowledgeFiles)
            .filter(([path]) =>
              [
                'knowledge.md',
                'CLAUDE.md',
                'codebuff.json',
                'codebuff.jsonc',
              ].includes(path)
            )
            .map(([path, content]) => [path, content.trim()])
        ),
        ...fileContext.userKnowledgeFiles,
      }).map(([path, content]) => ({
        toolName: 'read_files',
        toolCallId: generateCompactId(),
        result: JSON.stringify({ path, content }),
      }))
    ),
  }

  // Add agent instructions if available
  const agentInstructions = getAgentInstructionsPrompt(fileContext, agentState.agentType || undefined)
  if (agentInstructions) {
    toInject[PLACEHOLDER.INITIAL_AGENT_PROMPT] = processedPrompt + agentInstructions
  }

  for (const varName of placeholderValues) {
    if (toInject[varName]) {
      prompt = prompt.replaceAll(varName, toInject[varName])
    }
  }
  return prompt
}

type StringField = 'systemPrompt' | 'userInputPrompt' | 'agentStepPrompt'
type RequirePrompt = 'initialAssistantMessage' | 'initialAssistantPrefix'

export async function getAgentPrompt<T extends StringField | RequirePrompt>(
  agentTemplate: AgentTemplate,
  promptType: T extends StringField ? { type: T } : { type: T; prompt: string },
  fileContext: ProjectFileContext,
  agentState: AgentState
): Promise<string | undefined> {
  const promptValue = agentTemplate[promptType.type]
  if (promptValue === undefined) {
    return undefined
  }
  const prompt = await formatPrompt(
    promptValue,
    fileContext,
    agentState,
    agentTemplate.toolNames,
    agentTemplate.spawnableAgents,
    ''
  )

  const addendum =
    promptType.type === 'userInputPrompt'
      ? '\n\n' +
        getShortToolInstructions(
          agentTemplate.toolNames,
          agentTemplate.spawnableAgents
        )
      : ''
  return prompt + addendum
}
