import { ToolName } from '@/tools'
import { Model } from 'common/constants'
import { AgentTemplateName } from 'common/types/agent-state'

export type AgentTemplate = {
  name: AgentTemplateName
  description: string
  model: Model
  toolNames: ToolName[]

  systemPrompt: string
  userInputPrompt: string
  agentStepPrompt: string
}

export const injectableVariables = [
  'CODEBUFF_CONFIG_SCHEMA',
  'CODEBUFF_FILE_TREE_PROMPT',
  'CODEBUFF_GIT_CHANGES_PROMPT',
  'CODEBUFF_REMAINING_AGENT_STEPS',
  'CODEBUFF_PROJECT_ROOT',
  'CODEBUFF_SYSTEM_INFO_PROMPT',
  'CODEBUFF_TOOLS_PROMPT',
  'CODEBUFF_USER_CWD',
] as const

export const editingToolNames: ToolName[] = [
  'create_plan',
  'run_terminal_command',
  'str_replace',
  'write_file',
] as const

export const readOnlyToolNames: ToolName[] = [
  'add_subgoal',
  'browser_logs',
  'code_search',
  'end_turn',
  'find_files',
  'read_files',
  'research',
  'think_deeply',
  'update_subgoal',
] as const

export const baseAgentToolNames: ToolName[] = [
  ...editingToolNames,
  ...readOnlyToolNames,
] as const
