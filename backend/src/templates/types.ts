import { Model } from 'common/constants'
import { AgentTemplateName } from 'common/types/agent-state'

import { ToolName } from '@/tools'

export type AgentTemplate = {
  name: AgentTemplateName
  description: string
  model: Model
  toolNames: ToolName[]

  systemPrompt: string
  userInputPrompt: string
  agentStepPrompt: string
}

export enum PLACEHOLDER {
  CONFIG_SCHEMA = '{CODEBUFF_CONFIG_SCHEMA}',
  FILE_TREE = '{CODEBUFF_FILE_TREE_PROMPT}',
  GIT_CHANGES = '{CODEBUFF_GIT_CHANGES_PROMPT}',
  REMAINING_STEPS = '{CODEBUFF_REMAINING_AGENT_STEPS}',
  PROJECT_ROOT = '{CODEBUFF_PROJECT_ROOT}',
  SYSTEM_INFO = '{CODEBUFF_SYSTEM_INFO_PROMPT}',
  TOOLS = '{CODEBUFF_TOOLS_PROMPT}',
  USER_CWD = '{CODEBUFF_USER_CWD}',
}

// All injectable placeholders
export const injectablePlaceholders = Object.values(PLACEHOLDER)

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
