import { CodebuffConfigSchema } from 'common/json-config/constants'
import { stringifySchema } from 'common/json-config/stringify-schema'
import { AgentTemplateType, SessionState } from 'common/types/session-state'

import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from '@/system-prompt/prompts'
import { getToolsInstructions, ToolName } from '@/tools'

import { agentTemplates } from './agent-list'
import { PLACEHOLDER, PlaceholderValue, placeholderValues } from './types'

export function formatPrompt(
  prompt: string,
  sessionState: SessionState,
  tools: ToolName[]
): string {
  const toInject: Record<PlaceholderValue, string> = {
    [PLACEHOLDER.CONFIG_SCHEMA]: stringifySchema(CodebuffConfigSchema),
    [PLACEHOLDER.FILE_TREE_PROMPT]: getProjectFileTreePrompt(
      sessionState.fileContext,
      20_000,
      'agent'
    ),
    [PLACEHOLDER.GIT_CHANGES_PROMPT]: getGitChangesPrompt(
      sessionState.fileContext
    ),
    [PLACEHOLDER.REMAINING_STEPS]: `${sessionState.mainAgent?.stepsRemaining!}`,
    [PLACEHOLDER.PROJECT_ROOT]: sessionState.fileContext.projectRoot,
    [PLACEHOLDER.SYSTEM_INFO_PROMPT]: getSystemInfoPrompt(
      sessionState.fileContext
    ),
    [PLACEHOLDER.TOOLS_PROMPT]: getToolsInstructions(tools),
    [PLACEHOLDER.USER_CWD]: sessionState.fileContext.cwd,
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
  sessionState: SessionState
): string {
  const agentTemplate = agentTemplates[agentTemplateName]
  return formatPrompt(
    agentTemplate[promptType],
    sessionState,
    agentTemplate.toolNames
  )
}
