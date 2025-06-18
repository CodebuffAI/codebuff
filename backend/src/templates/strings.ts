import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from '@/system-prompt/prompts'
import { getToolsInstructions, ToolName } from '@/tools'
import { CodebuffConfigSchema } from 'common/json-config/constants'
import { stringifySchema } from 'common/json-config/stringify-schema'
import { AgentState } from 'common/types/agent-state'
import { injectableVariables } from './types'

export function formatPrompt(
  prompt: string,
  agentState: AgentState,
  tools: ToolName[],
  cwd: string
) {
  const toInject: Record<(typeof injectableVariables)[number], string> = {
    CODEBUFF_CONFIG_SCHEMA: stringifySchema(CodebuffConfigSchema),
    CODEBUFF_FILE_TREE_PROMPT: getProjectFileTreePrompt(
      agentState.fileContext,
      20_000,
      'agent'
    ),
    CODEBUFF_GIT_CHANGES_PROMPT: getGitChangesPrompt(agentState.fileContext),
    CODEBUFF_REMAINING_AGENT_STEPS: `${agentState.agentStepsRemaining!}`,
    CODEBUFF_PROJECT_ROOT: agentState.fileContext.currentWorkingDirectory,
    CODEBUFF_SYSTEM_INFO_PROMPT: getSystemInfoPrompt(agentState.fileContext),
    CODEBUFF_TOOLS_PROMPT: getToolsInstructions(tools),
    CODEBUFF_USER_CWD: cwd,
  }

  for (const varName of injectableVariables) {
    if (toInject[varName]) {
      prompt = prompt.replaceAll(`{${varName}}`, toInject[varName])
    }
  }

  return prompt
}
