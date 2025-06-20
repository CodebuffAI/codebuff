import { Model } from 'common/constants'
import { AgentTemplateType } from 'common/types/session-state'

import { ToolName } from '@/tools'

export type AgentTemplate = {
  name: AgentTemplateType
  description: string
  model: Model
  toolNames: ToolName[]

  systemPrompt: string
  userInputPrompt: string
  agentStepPrompt: string
}

const placeholderNames = [
  'CONFIG_SCHEMA',
  'FILE_TREE_PROMPT',
  'GIT_CHANGES_PROMPT',
  'REMAINING_STEPS',
  'PROJECT_ROOT',
  'SYSTEM_INFO_PROMPT',
  'TOOLS_PROMPT',
  'USER_CWD',
] as const

type PlaceholderType<T extends typeof placeholderNames> = {
  [K in T[number]]: `{CODEBUFF_${K}}`
}

export const PLACEHOLDER = Object.fromEntries(
  placeholderNames.map((name) => [name, `{CODEBUFF_${name}}` as const])
) as PlaceholderType<typeof placeholderNames>

export type PlaceholderValue = (typeof PLACEHOLDER)[keyof typeof PLACEHOLDER]

export const placeholderValues = Object.values(PLACEHOLDER)

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
