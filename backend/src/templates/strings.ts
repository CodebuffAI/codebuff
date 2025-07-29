import type { ToolName } from '@codebuff/common/tools/constants'

import { CodebuffConfigSchema } from '@codebuff/common/json-config/constants'
import { stringifySchema } from '@codebuff/common/json-config/stringify-schema'
import {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'
import { z } from 'zod/v4'

import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from '../system-prompt/prompts'
import {
  getShortToolInstructions,
  getToolsInstructions,
} from '../tools/prompts'

import { renderToolResults } from '@codebuff/common/tools/utils'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { escapeString, generateCompactId } from '@codebuff/common/util/string'
import { parseUserMessage } from '../util/messages'
import { agentTemplates } from './agent-list'
import { type AgentRegistry } from './agent-registry'
import { buildSubagentsDescription } from './prompts'
import {
  AgentTemplate,
  PLACEHOLDER,
  PlaceholderValue,
  placeholderValues,
} from './types'

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

  const toInject: Record<PlaceholderValue, string> = {
    [PLACEHOLDER.AGENT_NAME]: agentState.agentType
      ? agentRegistry[agentState.agentType]?.displayName ||
        agentTemplates[agentState.agentType]?.displayName ||
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
    [PLACEHOLDER.TOOLS_PROMPT]: getToolsInstructions(tools),
    [PLACEHOLDER.AGENTS_PROMPT]: buildSubagentsDescription(
      spawnableAgents,
      agentRegistry
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

type StringField = 'systemPrompt' | 'instructionsPrompt' | 'stepPrompt'

export async function collectParentInstructions(
  agentType: string,
  agentRegistry: AgentRegistry
): Promise<string[]> {
  const instructions: string[] = []

  for (const template of Object.values(agentRegistry)) {
    if (template.parentInstructions) {
      const instruction = template.parentInstructions[agentType]
      if (instruction) {
        instructions.push(instruction)
      }
    }
  }

  return instructions
}

export async function getAgentPrompt<T extends StringField>(
  agentTemplate: AgentTemplate,
  promptType: { type: T },
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
    agentTemplate.subagents,
    agentRegistry,
    ''
  )

  let addendum = ''

  // Add parent instructions for instructionsPrompt
  if (promptType.type === 'instructionsPrompt' && agentState.agentType) {
    addendum +=
      '\n\n' +
      getShortToolInstructions(agentTemplate.toolNames) +
      '\n\n' +
      buildSubagentsDescription(agentTemplate.subagents, agentRegistry)

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
