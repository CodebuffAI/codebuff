import { CodebuffConfigSchema } from '@codebuff/common/json-config/constants'
import { renderToolResults } from '@codebuff/common/tools/utils'
import { escapeString, generateCompactId } from '@codebuff/common/util/string'
import { schemaToJsonStr } from '@codebuff/common/util/zod-schema'
import { z } from 'zod/v4'

import { getAgentTemplate } from './agent-registry'
import { buildSpawnableAgentsDescription } from './prompts'
import { PLACEHOLDER, placeholderValues } from './types'
import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from '../system-prompt/prompts'
import {
  getShortToolInstructions,
  getToolsInstructions,
} from '../tools/prompts'
import { parseUserMessage } from '../util/messages'

import type { AgentTemplate, PlaceholderValue } from './types'
import type {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

export async function formatPrompt(
  prompt: string,
  fileContext: ProjectFileContext,
  agentState: AgentState,
  tools: readonly string[],
  spawnableAgents: AgentTemplateType[],
  agentTemplates: Record<string, AgentTemplate>,
  intitialAgentPrompt?: string,
): Promise<string> {
  const { messageHistory } = agentState
  const lastUserMessage = messageHistory.findLast(
    ({ role, content }) =>
      role === 'user' &&
      typeof content === 'string' &&
      parseUserMessage(content),
  )
  const lastUserInput = lastUserMessage
    ? parseUserMessage(lastUserMessage.content as string)
    : undefined

  const agentTemplate = agentState.agentType
    ? await getAgentTemplate(agentState.agentType, agentTemplates)
    : null

  const toInject: Record<PlaceholderValue, string> = {
    [PLACEHOLDER.AGENT_NAME]: agentTemplate
      ? agentTemplate.displayName || 'Unknown Agent'
      : 'Buffy',
    [PLACEHOLDER.CONFIG_SCHEMA]: schemaToJsonStr(CodebuffConfigSchema),
    [PLACEHOLDER.FILE_TREE_PROMPT]: getProjectFileTreePrompt(
      fileContext,
      20_000,
      'agent',
    ),
    [PLACEHOLDER.GIT_CHANGES_PROMPT]: getGitChangesPrompt(fileContext),
    [PLACEHOLDER.REMAINING_STEPS]: `${agentState.stepsRemaining!}`,
    [PLACEHOLDER.PROJECT_ROOT]: fileContext.projectRoot,
    [PLACEHOLDER.SYSTEM_INFO_PROMPT]: getSystemInfoPrompt(fileContext),
    [PLACEHOLDER.TOOLS_PROMPT]: getToolsInstructions(
      tools,
      fileContext.customToolDefinitions,
    ),
    [PLACEHOLDER.AGENTS_PROMPT]: await buildSpawnableAgentsDescription(
      spawnableAgents,
      agentTemplates,
    ),
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
              ].includes(path),
            )
            .map(([path, content]) => [path, content.trim()]),
        ),
        ...fileContext.userKnowledgeFiles,
      }).map(([path, content]) => ({
        toolName: 'read_files',
        toolCallId: generateCompactId(),
        output: { type: 'text', value: JSON.stringify({ path, content }) },
      })),
    ),
  }

  for (const varName of placeholderValues) {
    if (toInject[varName]) {
      prompt = prompt.replaceAll(varName, toInject[varName])
    }
  }
  return prompt
}
type StringField = 'systemPrompt' | 'instructionsPrompt' | 'stepPrompt'

export async function collectParentInstructions(
  agentType: string,
  agentTemplates: Record<string, AgentTemplate>,
): Promise<string[]> {
  const instructions: string[] = []

  for (const template of Object.values(agentTemplates)) {
    if (template.parentInstructions) {
      const instruction = template.parentInstructions[agentType]
      if (instruction) {
        instructions.push(instruction)
      }
    }
  }

  return instructions
}

const additionalPlaceholders = {
  systemPrompt: [PLACEHOLDER.TOOLS_PROMPT, PLACEHOLDER.AGENTS_PROMPT],
  instructionsPrompt: [],
  stepPrompt: [],
} satisfies Record<StringField, string[]>
export async function getAgentPrompt<T extends StringField>(
  agentTemplate: AgentTemplate,
  promptType: { type: T },
  fileContext: ProjectFileContext,
  agentState: AgentState,
  agentTemplates: Record<string, AgentTemplate>,
): Promise<string | undefined> {
  let promptValue = agentTemplate[promptType.type]
  for (const placeholder of additionalPlaceholders[promptType.type]) {
    if (!promptValue.includes(placeholder)) {
      promptValue += `\n\n${placeholder}`
    }
  }

  if (promptValue === undefined) {
    return undefined
  }

  const prompt = await formatPrompt(
    promptValue,
    fileContext,
    agentState,
    agentTemplate.toolNames,
    agentTemplate.spawnableAgents,
    agentTemplates,
    '',
  )

  let addendum = ''

  // Add tool instructions, spawnable agents, and output schema prompts to instructionsPrompt
  if (promptType.type === 'instructionsPrompt' && agentState.agentType) {
    addendum +=
      '\n\n' +
      getShortToolInstructions(
        agentTemplate.toolNames,
        fileContext.customToolDefinitions,
      ) +
      '\n\n' +
      (await buildSpawnableAgentsDescription(
        agentTemplate.spawnableAgents,
        agentTemplates,
      ))

    const parentInstructions = await collectParentInstructions(
      agentState.agentType,
      agentTemplates,
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
        const jsonSchema = z.toJSONSchema(agentTemplate.outputSchema, {
          io: 'input',
        })
        delete jsonSchema['$schema'] // Remove the $schema field for cleaner display
        addendum += JSON.stringify(jsonSchema, null, 2)
      } catch {
        // Fallback to a simple description
        addendum += JSON.stringify(
          { type: 'object', description: 'Output schema validation enabled' },
          null,
          2,
        )
      }
      addendum += '\n```'
    }
  }

  return prompt + addendum
}
