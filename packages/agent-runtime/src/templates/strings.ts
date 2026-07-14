import { KNOWLEDGE_FILE_NAMES_LOWERCASE } from '@codebuff/common/constants/knowledge'
import { frontendSection } from '@codebuff/common/constants/prompt-sections'
import { formatLanguageProfilePromptForFileTree } from '@codebuff/common/util/language-profiles'
import { formatEngineProfilePromptForFileTree } from '@codebuff/common/util/engine-profiles'
import {
  formatPatternsIndexPrompt,
  loadPatternsIndex,
} from '@codebuff/common/util/patterns'
import {
  formatRoutedKnowledgeSection,
  getKnowledgeBudgetChars,
  inferKnowledgeTaskType,
  loadRoutedKnowledgeContents,
  loadRouterTable,
  resolveRoutedKnowledgeFiles,
} from '@codebuff/common/util/router'
import { escapeString } from '@codebuff/common/util/string'
import { z } from 'zod/v4'

import { getAgentTemplate } from './agent-registry'
import { buildFullSpawnableAgentsSpec } from './prompts'
import { PLACEHOLDER, placeholderValues } from './types'
import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from '../system-prompt/prompts'
import { parseUserMessage } from '../util/messages'

import type { AgentTemplate, PlaceholderValue } from './types'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type {
  Message,
  UserMessage,
} from '@codebuff/common/types/messages/codebuff-message'
import type { TextPart } from '@codebuff/common/types/messages/content-part'
import type {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'
import type {
  CustomToolDefinitions,
  ProjectFileContext,
} from '@codebuff/common/util/file'
import { fileTreeHasFrontendFiles } from '@codebuff/common/util/file'

export function formatCurrentDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

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
    tools: _tools,
    spawnableAgents: _spawnableAgents,
    agentTemplates,
    intitialAgentPrompt,
    additionalToolDefinitions: _additionalToolDefinitions,
    logger,
  } = params
  let { prompt } = params

  const { messageHistory } = agentState
  function isUserInputMessage(message: Message): message is UserMessage & {
    content: [TextPart, ...any[]]
  } {
    return (
      message.role === 'user' &&
      message.content[0].type === 'text' &&
      parseUserMessage(message.content[0].text) !== undefined
    )
  }
  const lastUserMessage = messageHistory.findLast(isUserInputMessage)
  const lastUserInput = lastUserMessage
    ? parseUserMessage(lastUserMessage.content[0].text)
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
    [PLACEHOLDER.CURRENT_DATE]: () => formatCurrentDate(new Date()),
    [PLACEHOLDER.FILE_TREE_PROMPT_SMALL]: () =>
      getProjectFileTreePrompt({
        fileContext,
        fileTreeTokenBudget: 2_500,
        mode: 'agent',
        logger,
      }),
    [PLACEHOLDER.FRONTEND_SECTION]: () =>
      fileTreeHasFrontendFiles(fileContext.fileTree) ? frontendSection : '',
    [PLACEHOLDER.LANGUAGE_PROFILE]: () =>
      formatLanguageProfilePromptForFileTree(fileContext.fileTree, {
        taskText: lastUserInput ?? intitialAgentPrompt ?? '',
        maxProfiles: 3,
      }) + formatEngineProfilePromptForFileTree(fileContext.fileTree),
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
    [PLACEHOLDER.REMAINING_STEPS]: () =>
      agentState.stepsRemaining < 0
        ? 'unlimited (no-progress watchdog active)'
        : `${agentState.stepsRemaining}`,
    [PLACEHOLDER.PROJECT_ROOT]: () => fileContext.projectRoot,
    [PLACEHOLDER.SYSTEM_INFO_PROMPT]: () => getSystemInfoPrompt(fileContext),
    [PLACEHOLDER.USER_CWD]: () => fileContext.cwd,
    [PLACEHOLDER.USER_INPUT_PROMPT]: () => escapeString(lastUserInput ?? ''),
    [PLACEHOLDER.INITIAL_AGENT_PROMPT]: () =>
      escapeString(intitialAgentPrompt ?? ''),
    [PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS]: () =>
      Object.entries({
        ...Object.fromEntries(
          Object.entries(fileContext.knowledgeFiles)
            .filter(([filePath]) => {
              const lowerPath = filePath.toLowerCase()
              // Root-level knowledge files only (knowledge.md, AGENTS.md, CLAUDE.md)
              return KNOWLEDGE_FILE_NAMES_LOWERCASE.includes(lowerPath)
            })
            .map(([path, content]) => [path, content.trim()]),
        ),
        ...fileContext.userKnowledgeFiles,
      })
        .map(([path, content]) => {
          return `\`\`\`${path}\n${content.trim()}\n\`\`\``
        })
        .join('\n\n'),
    [PLACEHOLDER.ROUTED_KNOWLEDGE_FILES]: () => {
      // P0.11 task-routed knowledge loader. When `<projectRoot>/ROUTER.md`
      // exists and has an entry for the current agent, render only the files
      // that entry lists. Otherwise fall back to today's behavior (all root
      // knowledge files) so this change is strictly additive. User-level
      // knowledge files (`~/.knowledge.md`) are always merged in, matching
      // the existing `KNOWLEDGE_FILES_CONTENTS` provider.
      const routerTable = loadRouterTable(fileContext.projectRoot, logger)
      const taskType = inferKnowledgeTaskType(lastUserInput)
      const routeKey = agentTemplate?.id
        ? [`${agentTemplate.id}:${taskType}`, agentTemplate.id].find((key) =>
            Object.prototype.hasOwnProperty.call(routerTable, key),
          )
        : undefined
      const selectedFiles = routeKey
        ? routerTable[routeKey]
        : resolveRoutedKnowledgeFiles({
            routerTable,
            agentId: agentTemplate?.id,
            taskType,
            knowledgeFiles: fileContext.knowledgeFiles,
            logger,
          })
      const routedContents = loadRoutedKnowledgeContents({
        projectRoot: fileContext.projectRoot,
        files: selectedFiles,
        knowledgeFiles: fileContext.knowledgeFiles,
        logger,
      })
      const blocks: string[] = []
      const projectSection = formatRoutedKnowledgeSection({
        files: selectedFiles,
        knowledgeFiles: routedContents,
        maxChars: getKnowledgeBudgetChars(taskType),
      })
      if (projectSection) blocks.push(projectSection)
      for (const [p, content] of Object.entries(
        fileContext.userKnowledgeFiles ?? {},
      )) {
        const trimmed = (content ?? '').trim()
        if (!trimmed) continue
        blocks.push('```' + p + '\n' + trimmed + '\n```')
      }
      if (blocks.length === 0) return ''
      return blocks.join('\n\n')
    },
    [PLACEHOLDER.PATTERNS_INDEX]: () => {
      // P1.14 patterns library. Renders a compact catalog of available
      // pattern guides from `agents/patterns/INDEX.md`. Individual pattern
      // files are NOT loaded here — agents `read_files` the specific pattern
      // on demand when a task matches. Returns '' when the index is absent
      // or empty so the placeholder collapses cleanly.
      const index = loadPatternsIndex(fileContext.projectRoot, logger)
      return formatPatternsIndexPrompt({ index })
    },
  }

  for (const varName of placeholderValues) {
    const valueProvider = toInject[varName] ?? (() => '')
    const value = await valueProvider()
    prompt = prompt.replaceAll(varName, value)
  }
  return prompt
}
type StringField = 'systemPrompt' | 'instructionsPrompt' | 'stepPrompt'

export async function getAgentPrompt<T extends StringField>(
  params: {
    agentTemplate: AgentTemplate
    promptType: { type: T }
    fileContext: ProjectFileContext
    agentState: AgentState
    agentTemplates: Record<string, AgentTemplate>
    additionalToolDefinitions: () => Promise<CustomToolDefinitions>
    logger: Logger
    useParentTools?: boolean
  } & ParamsExcluding<
    typeof formatPrompt,
    'prompt' | 'tools' | 'spawnableAgents'
  > &
    ParamsExcluding<
      typeof buildFullSpawnableAgentsSpec,
      'spawnableAgents' | 'agentTemplates'
    >,
): Promise<string | undefined> {
  const {
    agentTemplate,
    promptType,
    agentState,
    agentTemplates,
    additionalToolDefinitions: _additionalToolDefinitions,
    useParentTools,
  } = params

  const { toolNames, spawnableAgents, outputSchema } = agentTemplate
  const promptValue = agentTemplate[promptType.type]

  let prompt = await formatPrompt({
    ...params,
    prompt: promptValue,
    tools: toolNames,
    spawnableAgents,
  })

  let addendum = ''

  if (promptType.type === 'stepPrompt' && agentState.agentType && prompt) {
    // Put step prompt within a system_reminder tag so agent doesn't think the user just spoke again.
    prompt = `<system_reminder>${prompt}</system_reminder>`
  }

  // Add tool instructions, spawnable agents, and output schema prompts to instructionsPrompt
  if (promptType.type === 'instructionsPrompt' && agentState.agentType) {
    const isInheritedSubagentPrompt =
      agentTemplate.inheritParentSystemPrompt &&
      agentState.parentId !== undefined

    // Add subagent tools message when using parent's tools for prompt caching
    if (isInheritedSubagentPrompt) {
      addendum += `\n\nYou are a subagent that only has access to the following tools: ${toolNames.length > 0 ? toolNames.join(', ') : 'none'}. Previously referenced tools in the conversation may have only been available to the parent agent. Do not attempt to use any other tools besides these listed here. You will only get tool errors if you do.`

      // For subagents with inheritSystemPrompt, include full spawnable agents spec
      // since the parent's system prompt may not have these agents listed
      if (useParentTools && spawnableAgents.length > 0) {
        const spawnableAgentsSpec = await buildFullSpawnableAgentsSpec({
          ...params,
          spawnableAgents,
          agentTemplates,
        })
        addendum += `\n\n${spawnableAgentsSpec}`
      }
    } else if (spawnableAgents.length > 0) {
      // Keep a compact capability catalog regardless of whether agents are
      // exposed as direct native tools or routed through generic spawn_agents.
      const agentDescriptions = await Promise.all(
        spawnableAgents.map(async (agentType) => {
          const template = await getAgentTemplate({
            ...params,
            agentId: agentType,
            localAgentTemplates: agentTemplates,
          })
          if (template?.spawnerPrompt) {
            return `- ${agentType}: ${template.spawnerPrompt}`
          }
          return `- ${agentType}`
        }),
      )
      addendum += `\n\nYou can spawn the following agents:\n\n${agentDescriptions.join('\n')}`
    }

    // Add output schema information if defined
    if (outputSchema) {
      addendum += '\n\n## Output Schema\n\n'
      addendum +=
        'When using the set_output tool, your output must conform to this schema. You may pass the fields either directly as top-level parameters or inside a `data` field — both are accepted. Pass native object values; never call JSON.stringify or put serialized JSON text inside `data`.\n\n'
      addendum += '```json\n'
      try {
        // Convert Zod schema to JSON schema for display
        const jsonSchema = z.toJSONSchema(outputSchema, {
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

  const combinedPrompt = (prompt + addendum).trim()
  if (combinedPrompt === '') {
    return undefined
  }

  return combinedPrompt
}
