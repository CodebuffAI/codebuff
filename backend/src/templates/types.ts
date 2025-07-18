import { z } from 'zod/v4'

import { Model } from '@codebuff/common/constants'
import { ToolName } from '@codebuff/common/constants/tools'
import {
  AgentTemplateType,
  AgentTemplateTypes,
  ToolResult,
} from '@codebuff/common/types/session-state'
import { CodebuffToolCall } from '../tools/constants'

export type AgentTemplate = {
  id: AgentTemplateType
  name: string
  description: string
  model: Model
  implementation: 'llm'
  // Required parameters for spawning this agent.
  promptSchema: {
    prompt?: z.ZodSchema<string | undefined>
    params?: z.ZodSchema<any>
  }
  outputMode: 'last_message' | 'report' | 'all_messages'
  includeMessageHistory: boolean
  toolNames: ToolName[]
  spawnableAgents: AgentTemplateType[]

  initialAssistantMessage: string | undefined
  initialAssistantPrefix: string | undefined
  stepAssistantMessage: string | undefined
  stepAssistantPrefix: string | undefined

  systemPrompt: string
  userInputPrompt: string
  agentStepPrompt: string
}

export interface ProgrammaticAgentTemplate {
  id: AgentTemplateType
  implementation: 'programmatic'
  name: string
  description: string
  handler: ProgrammaticAgentFunction // Direct generator function. TODO: replace with path to a file or string of source code?
  includeMessageHistory: boolean
  promptSchema: {
    prompt?: z.ZodSchema<string | undefined>
    params?: z.ZodSchema<any>
  }
  toolNames: ToolName[] // Tools this programmatic agent can use
  spawnableAgents: AgentTemplateType[] // Agents it can spawn
}

// Union type for all agent templates
export type AgentTemplateUnion = AgentTemplate | ProgrammaticAgentTemplate

// Context passed to programmatic agents
export interface ProgrammaticAgentContext {
  prompt: string
  params: any
}

// The generator function signature
export type ProgrammaticAgentFunction = (
  context: ProgrammaticAgentContext
) => Generator<Omit<CodebuffToolCall, 'toolCallId'>, void, ToolResult>

const placeholderNames = [
  'AGENT_NAME',
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

export const baseAgentToolNames: ToolName[] = [
  'create_plan',
  'run_terminal_command',
  'str_replace',
  'write_file',
  'spawn_agents',
  'add_subgoal',
  'browser_logs',
  'code_search',
  'end_turn',
  'read_files',
  'think_deeply',
  'update_subgoal',
] as const

export const baseAgentSpawnableAgents: AgentTemplateType[] = [
  AgentTemplateTypes.file_picker,
  AgentTemplateTypes.researcher,
  AgentTemplateTypes.thinker,
  AgentTemplateTypes.reviewer,
] as const
