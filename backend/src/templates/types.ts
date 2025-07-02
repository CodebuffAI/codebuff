import { Model } from '@codebuff/common/constants'
import {
  AgentTemplateType,
  AgentTemplateTypes,
} from '@codebuff/common/types/session-state'
import { z } from 'zod/v4'

import { ToolName } from '../tools'
import { generateCloseTags } from '../util/parse-tool-call-xml'

export type AgentTemplate = {
  type: AgentTemplateType
  description: string
  model: Model
  // Required parameters for spawning this agent.
  promptSchema: {
    prompt: boolean | 'optional'
    params: z.ZodSchema<any> | null
  }
  outputMode: 'last_message' | 'report' | 'all_messages'
  includeMessageHistory: boolean
  toolNames: ToolName[]
  stopSequences: string[]
  spawnableAgents: AgentTemplateType[]

  initialAssistantMessage?: (prompt: string | undefined, params: any) => string
  initialAssistantPrefix: string
  stepAssistantMessage?: (prompt: string | undefined, params: any) => string
  stepAssistantPrefix: string

  systemPrompt: string
  userInputPrompt: string
  agentStepPrompt: string
}

const placeholderNames = [
  'CONFIG_SCHEMA',
  'FILE_TREE_PROMPT',
  'GIT_CHANGES_PROMPT',
  'INITIAL_AGENT_PROMPT',
  'KNOWLEDGE_FILES_CONTENTS',
  'PROJECT_ROOT',
  'REMAINING_STEPS',
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
  'spawn_agents',
] as const

export const readOnlyToolNames: ToolName[] = [
  'add_subgoal',
  'browser_logs',
  'code_search',
  'end_turn',
  'read_docs',
  'read_files',
  'think_deeply',
  'update_subgoal',
  'web_search',
] as const

export const baseAgentToolNames: ToolName[] = [
  ...editingToolNames,
  ...readOnlyToolNames,
] as const

// Use the utility function to generate stop sequences for key tools
export const baseAgentStopSequences: string[] = generateCloseTags([
  'read_files',
  'find_files',
  'run_terminal_command',
  'code_search',
  'spawn_agents',
] as const)

export const baseAgentSpawnableAgents: AgentTemplateType[] = [
  AgentTemplateTypes.file_picker,
  AgentTemplateTypes.gemini25flash_researcher,
  // AgentTemplateTypes.gemini25pro_planner,
  AgentTemplateTypes.gemini25pro_reviewer,
] as const
