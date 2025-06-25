import { AgentTemplateType, AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { Model } from 'common/constants'

import { ToolName } from '../tools'

export type AgentTemplate = {
  type: AgentTemplateType
  description: string
  model: Model
  toolNames: ToolName[]
  stopSequences: string[]
  spawnableAgents: AgentTemplateType[]

  initialAssistantMessage: string
  initialAssistantPrefix: string
  stepAssistantMessage: string
  stepAssistantPrefix: string

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
  'INITIAL_AGENT_PROMPT',
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
  'think_deeply',
  'update_subgoal',
] as const

export const baseAgentToolNames: ToolName[] = [
  ...editingToolNames,
  ...readOnlyToolNames,
] as const

export const baseAgentStopSequences: string[] = [
  '</read_files>',
  '</find_files>',
  '</run_terminal_command>',
  '</code_search>',
] as const

export const baseAgentSpawnableAgents: AgentTemplateType[] = [
  AgentTemplateTypes.gemini25pro_thinker,
  AgentTemplateTypes.gemini25flash_file_picker,
  AgentTemplateTypes.gemini25pro_planner,
] as const