import { CodebuffConfigSchema } from 'common/json-config/constants'
import { stringifySchema } from 'common/json-config/stringify-schema'
import { AgentState, AgentTemplateName } from 'common/types/agent-state'

import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from '@/system-prompt/prompts'
import { getToolsInstructions, ToolName } from '@/tools'

import { agentTemplates } from './agent-list'
import { PLACEHOLDER, injectablePlaceholders } from './types'

export function formatPrompt(
  prompt: string,
  agentState: AgentState,
  tools: ToolName[]
): string {
  const toInject: Record<PLACEHOLDER, string> = {
    [PLACEHOLDER.CONFIG_SCHEMA]: stringifySchema(CodebuffConfigSchema),
    [PLACEHOLDER.FILE_TREE]: getProjectFileTreePrompt(
      agentState.fileContext,
      20_000,
      'agent'
    ),
    [PLACEHOLDER.GIT_CHANGES]: getGitChangesPrompt(agentState.fileContext),
    [PLACEHOLDER.REMAINING_STEPS]: `${agentState.agentStepsRemaining!}`,
    [PLACEHOLDER.PROJECT_ROOT]: agentState.fileContext.projectRoot,
    [PLACEHOLDER.SYSTEM_INFO]: getSystemInfoPrompt(agentState.fileContext),
    [PLACEHOLDER.TOOLS]: getToolsInstructions(tools),
    [PLACEHOLDER.USER_CWD]: agentState.fileContext.cwd,
  }

  for (const varName of injectablePlaceholders) {
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
