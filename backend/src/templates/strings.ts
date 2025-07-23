import { z } from 'zod/v4'
import { CodebuffConfigSchema } from '@codebuff/common/json-config/constants'
import { stringifySchema } from '@codebuff/common/json-config/stringify-schema'
import {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'

import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from '../system-prompt/prompts'
import { getShortToolInstructions, getToolsInstructions } from '../tools'

import { renderToolResults, ToolName } from '@codebuff/common/constants/tools'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { escapeString, generateCompactId } from '@codebuff/common/util/string'
import { agentTemplates } from './agent-list'
import {
  PLACEHOLDER,
  PlaceholderValue,
  placeholderValues,
  AgentTemplate,
} from './types'
import type { AgentRegistry } from './agent-registry'
import { parseUserMessage } from '../util/messages'

export async function formatPrompt(
  prompt: string,
  fileContext: ProjectFileContext,
  agentState: AgentState,
  tools: ToolName[],
  spawnableAgents: AgentTemplateType[],
  agentRegistry: AgentRegistry,
  intitialAgentPrompt?: string
): Promise<string> {
  const { messageHistory } = agentState
  const lastUserMessage = messageHistory.findLast(
    ({ role, content }) =>
      role === 'user' &&
      typeof content === 'string' &&
      parseUserMessage(content)
  )
  const lastUserInput = lastUserMessage
    ? parseUserMessage(lastUserMessage.content as string)
    : undefined

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
    [PLACEHOLDER.USER_INPUT_PROMPT]: escapeString(lastUserInput ?? ''),
    [PLACEHOLDER.INITIAL_AGENT_PROMPT]: escapeString(intitialAgentPrompt ?? ''),
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

  for (const varName of placeholderValues) {
    if (toInject[varName]) {
      prompt = prompt.replaceAll(varName, toInject[varName])
    }
  }
  return prompt
}

type StringField = 'systemPrompt' | 'userInputPrompt' | 'agentStepPrompt'
type RequirePrompt = 'initialAssistantMessage' | 'initialAssistantPrefix'

export async function collectParentInstructions(
  agentType: string,
  agentRegistry: AgentRegistry
): Promise<string[]> {
  const instructions: string[] = []
  const allTemplates = agentRegistry.getAllTemplates()

  for (const template of Object.values(allTemplates)) {
    if (template.parentInstructions) {
      const instruction = template.parentInstructions[agentType]
      if (instruction) {
        instructions.push(instruction)
      }
    }
  }

  return instructions
}

export async function getAgentPrompt<T extends StringField | RequirePrompt>(
  agentTemplate: AgentTemplate,
  promptType: T extends StringField ? { type: T } : { type: T; prompt: string },
  fileContext: ProjectFileContext,
  agentState: AgentState,
  agentRegistry: AgentRegistry
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
    agentRegistry,
    ''
  )

  let addendum = ''

  // Add parent instructions for userInputPrompt
  if (promptType.type === 'userInputPrompt' && agentState.agentType) {
    addendum +=
      '\n\n' +
      getShortToolInstructions(
        agentTemplate.toolNames,
        agentTemplate.spawnableAgents
      )

    const parentInstructions = await collectParentInstructions(
      agentState.agentType,
      agentRegistry
    )

    if (parentInstructions.length > 0) {
      addendum += '\n\n## Additional Instructions for Spawning Agents\n\n'
      addendum += parentInstructions
        .map((instruction) => `- ${instruction}`)
        .join('\n')
    }

    // Add output schema information if defined
    if (agentTemplate.outputSchema) {
      addendum += '\n\n## Output Schema\n\n'
      addendum +=
        'When using the set_output tool, your output must conform to this schema:\n\n'
      addendum += '```json\n'
      try {
        // Convert Zod schema to JSON schema for display
        const jsonSchema = z.toJSONSchema(agentTemplate.outputSchema)
        delete jsonSchema['$schema'] // Remove the $schema field for cleaner display
        addendum += JSON.stringify(jsonSchema, null, 2)
      } catch {
        // Fallback to a simple description
        addendum += JSON.stringify(
          { type: 'object', description: 'Output schema validation enabled' },
          null,
          2
        )
      }
      addendum += '\n```'
    }
  }

  return prompt + addendum
}
