import { CodebuffConfigSchema } from '@codebuff/common/json-config/constants'
import { stringifySchema } from '@codebuff/common/json-config/stringify-schema'
import { AgentState, AgentTemplateName } from '@codebuff/common/types/agent-state'

import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from '../system-prompt/prompts'
import { getToolsInstructions, ToolName } from '../tools'

import { agentTemplates } from './agent-list'
import { PLACEHOLDER, PlaceholderValue, placeholderValues } from './types'

export function formatPrompt(
  prompt: string,
  agentState: AgentState,
  tools: ToolName[]
): string {
  const toInject: Record<PlaceholderValue, string> = {
    [PLACEHOLDER.CONFIG_SCHEMA]: stringifySchema(CodebuffConfigSchema),
    [PLACEHOLDER.FILE_TREE_PROMPT]: getProjectFileTreePrompt(
      agentState.fileContext,
      20_000,
      'agent'
    ),
    [PLACEHOLDER.GIT_CHANGES_PROMPT]: getGitChangesPrompt(
      agentState.fileContext
    ),
    [PLACEHOLDER.REMAINING_STEPS]: `${agentState.agentStepsRemaining!}`,
    [PLACEHOLDER.PROJECT_ROOT]: agentState.fileContext.projectRoot,
    [PLACEHOLDER.SYSTEM_INFO_PROMPT]: getSystemInfoPrompt(
      agentState.fileContext
    ),
    [PLACEHOLDER.TOOLS_PROMPT]: getToolsInstructions(tools),
    [PLACEHOLDER.USER_CWD]: agentState.fileContext.cwd,
  }

  for (const varName of placeholderValues) {
    if (toInject[varName]) {
      prompt = prompt.replaceAll(varName, toInject[varName])
    }
  }

  return prompt
}

export function getAgentPrompt(
  agentTemplateName: AgentTemplateName,
  promptType: 'systemPrompt' | 'userInputPrompt' | 'agentStepPrompt',
  agentState: AgentState
): string {
  const agentTemplate = agentTemplates[agentTemplateName]
  return formatPrompt(
    agentTemplate[promptType],
    agentState,
    agentTemplate.toolNames
  )
}
