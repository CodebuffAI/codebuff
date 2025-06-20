import { CodebuffConfigSchema } from 'common/json-config/constants'
import { stringifySchema } from 'common/json-config/stringify-schema'
import { AgentState, AgentTemplateType } from 'common/types/session-state'

import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from '@/system-prompt/prompts'
import { getToolsInstructions, ToolName } from '@/tools'

import { ProjectFileContext } from 'common/util/file'
import { agentTemplates } from './agent-list'
import { PLACEHOLDER, PlaceholderValue, placeholderValues } from './types'

export function formatPrompt(
  prompt: string,
  fileContext: ProjectFileContext,
  agentState: AgentState,
  tools: ToolName[]
): string {
  const toInject: Record<PlaceholderValue, string> = {
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
    [PLACEHOLDER.USER_CWD]: fileContext.cwd,
  }

  for (const varName of placeholderValues) {
    if (toInject[varName]) {
      prompt = prompt.replaceAll(varName, toInject[varName])
    }
  }

  return prompt
}

export function getAgentPrompt(
  agentTemplateName: AgentTemplateType,
  promptType: 'systemPrompt' | 'userInputPrompt' | 'agentStepPrompt',
  fileContext: ProjectFileContext,
  agentState: AgentState
): string {
  const agentTemplate = agentTemplates[agentTemplateName]
  return formatPrompt(
    agentTemplate[promptType],
    fileContext,
    agentState,
    agentTemplate.toolNames
  )
}
