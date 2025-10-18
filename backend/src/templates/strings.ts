import { getAgentTemplate } from '@codebuff/agent-runtime/templates/agent-registry'
import {
  PLACEHOLDER,
  placeholderValues,
} from '@codebuff/agent-runtime/templates/types'
import { parseUserMessage } from '@codebuff/agent-runtime/util/messages'
import { CodebuffConfigSchema } from '@codebuff/common/json-config/constants'
import { escapeString } from '@codebuff/common/util/string'
import { schemaToJsonStr } from '@codebuff/common/util/zod-schema'
import { z } from 'zod/v4'

import { buildSpawnableAgentsDescription } from './prompts'
import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from '../system-prompt/prompts'
import {
  fullToolList,
  getShortToolInstructions,
  getToolsInstructions,
} from '../tools/prompts'

import type {
  AgentTemplate,
  PlaceholderValue,
} from '@codebuff/agent-runtime/templates/types'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

export async function formatPrompt(
  params: {
    prompt: string
    fileContext: ProjectFileContext
    agentState: AgentState
    tools: readonly string[]
    spawnableAgents: AgentTemplateType[]
    agentTemplates: Record<string, AgentTemplate>
    intitialAgentPrompt?: string
    additionalToolDefinitions: () => Promise<
      ProjectFileContext['customToolDefinitions']
    >
    logger: Logger
  } & ParamsExcluding<
    typeof getAgentTemplate,
    'agentId' | 'localAgentTemplates'
  >,
): Promise<string> {
  const {
    fileContext,
    agentState,
    tools,
    spawnableAgents,
    agentTemplates,
    intitialAgentPrompt,
    additionalToolDefinitions,
    logger,
  } = params
  let { prompt } = params

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
    ? await getAgentTemplate({
        ...params,
        agentId: agentState.agentType,
        localAgentTemplates: agentTemplates,
      })
    : null

  const toInject: Record<PlaceholderValue, () => string | Promise<string>> = {
    [PLACEHOLDER.AGENT_NAME]: () =>
      agentTemplate ? agentTemplate.displayName || 'Unknown Agent' : 'Buffy',
    [PLACEHOLDER.CONFIG_SCHEMA]: () => schemaToJsonStr(CodebuffConfigSchema),
    [PLACEHOLDER.FILE_TREE_PROMPT_SMALL]: () =>
      getProjectFileTreePrompt({
        fileContext,
        fileTreeTokenBudget: 2_500,
        mode: 'agent',
        logger,
      }),
    [PLACEHOLDER.FILE_TREE_PROMPT]: () =>
      getProjectFileTreePrompt({
        fileContext,
        fileTreeTokenBudget: 10_000,
        mode: 'agent',
        logger,
      }),
    [PLACEHOLDER.FILE_TREE_PROMPT_LARGE]: () =>
      getProjectFileTreePrompt({
        fileContext,
        fileTreeTokenBudget: 190_000,
        mode: 'search',
        logger,
      }),
    [PLACEHOLDER.GIT_CHANGES_PROMPT]: () => getGitChangesPrompt(fileContext),
    [PLACEHOLDER.REMAINING_STEPS]: () => `${agentState.stepsRemaining!}`,
    [PLACEHOLDER.PROJECT_ROOT]: () => fileContext.projectRoot,
    [PLACEHOLDER.SYSTEM_INFO_PROMPT]: () => getSystemInfoPrompt(fileContext),
    [PLACEHOLDER.TOOLS_PROMPT]: async () =>
      getToolsInstructions(tools, await additionalToolDefinitions()),
    [PLACEHOLDER.AGENTS_PROMPT]: () => buildSpawnableAgentsDescription(params),
    [PLACEHOLDER.USER_CWD]: () => fileContext.cwd,
    [PLACEHOLDER.USER_INPUT_PROMPT]: () => escapeString(lastUserInput ?? ''),
    [PLACEHOLDER.INITIAL_AGENT_PROMPT]: () =>
      escapeString(intitialAgentPrompt ?? ''),
    [PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS]: () =>
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
      })
        .map(([path, content]) => {
          return `\`\`\`${path}\n${content.trim()}\n\`\`\``
        })
        .join('\n\n'),
  }

  for (const varName of placeholderValues) {
    const value = await (toInject[varName] ?? (() => ''))()
    prompt = prompt.replaceAll(varName, value)
  }
  return prompt
}
type StringField = 'systemPrompt' | 'instructionsPrompt' | 'stepPrompt'

export async function collectParentInstructions(params: {
  agentType: string
  agentTemplates: Record<string, AgentTemplate>
}): Promise<string[]> {
  const { agentType, agentTemplates } = params
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
  params: {
    agentTemplate: AgentTemplate
    promptType: { type: T }
    fileContext: ProjectFileContext
    agentState: AgentState
    agentTemplates: Record<string, AgentTemplate>
    additionalToolDefinitions: () => Promise<
      ProjectFileContext['customToolDefinitions']
    >
    logger: Logger
  } & ParamsExcluding<
    typeof formatPrompt,
    'prompt' | 'tools' | 'spawnableAgents'
  > &
    ParamsExcluding<
      typeof buildSpawnableAgentsDescription,
      'spawnableAgents' | 'agentTemplates'
    >,
): Promise<string | undefined> {
  const {
    agentTemplate,
    promptType,
    fileContext,
    agentState,
    agentTemplates,
    additionalToolDefinitions,
    logger,
  } = params

  let promptValue = agentTemplate[promptType.type]
  for (const placeholder of additionalPlaceholders[promptType.type]) {
    if (!promptValue.includes(placeholder)) {
      promptValue += `\n\n${placeholder}`
    }
  }

  if (promptValue === undefined) {
    return undefined
  }

  let prompt = await formatPrompt({
    ...params,
    prompt: promptValue,
    tools: agentTemplate.toolNames,
    spawnableAgents: agentTemplate.spawnableAgents,
  })

  let addendum = ''

  if (promptType.type === 'stepPrompt' && agentState.agentType) {
    // Put step prompt within a system_reminder tag so agent doesn't think the user just spoke again.
    prompt = `<system_reminder>${prompt}</system_reminder>`
  }

  // Add tool instructions, spawnable agents, and output schema prompts to instructionsPrompt
  if (promptType.type === 'instructionsPrompt' && agentState.agentType) {
    const toolsInstructions = agentTemplate.inheritParentSystemPrompt
      ? fullToolList(agentTemplate.toolNames, await additionalToolDefinitions())
      : getShortToolInstructions(
          agentTemplate.toolNames,
          await additionalToolDefinitions(),
        )
    addendum +=
      '\n\n' +
      toolsInstructions +
      '\n\n' +
      (await buildSpawnableAgentsDescription({
        ...params,
        spawnableAgents: agentTemplate.spawnableAgents,
        agentTemplates,
      }))

    const parentInstructions = await collectParentInstructions({
      agentType: agentState.agentType,
      agentTemplates,
    })

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
