import { z } from 'zod/v4'

import { Model } from '@codebuff/common/constants'
import { ToolName } from '@codebuff/common/constants/tools'
import {
  AgentState,
  AgentTemplateType,
  AgentTemplateTypes,
  ToolResult,
} from '@codebuff/common/types/session-state'
import { CodebuffToolCall } from '../tools/constants'

export type AgentTemplate<
  P = string | undefined,
  T = Record<string, any> | undefined,
> = {
  id: AgentTemplateType
  name: string
  purpose: string
  model: Model
  // Required parameters for spawning this agent.
  promptSchema: {
    prompt?: z.ZodSchema<P>
    params?: z.ZodSchema<T>
  }
  outputMode: 'last_message' | 'all_messages' | 'json'
  outputSchema?: z.ZodSchema<any>
  includeMessageHistory: boolean
  toolNames: ToolName[]
  spawnableAgents: AgentTemplateType[]
  parentInstructions?: Record<string, string>

  systemPrompt: string
  userInputPrompt: string
  agentStepPrompt: string

  handleSteps?: StepHandler<P, T> | string // Function or string of the generator code for running in a sandbox
}

export type StepGenerator = Generator<
  Omit<CodebuffToolCall, 'toolCallId'> | 'STEP' | 'STEP_ALL',
  void,
  { agentState: AgentState; toolResult: ToolResult | undefined }
>

export type StepHandler<
  P = string | undefined,
  T = Record<string, any> | undefined,
> = (params: { agentState: AgentState; prompt: P; params: T }) => StepGenerator

const placeholderNames = [
  'AGENT_NAME',
  'AGENTS_PROMPT',
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
  'USER_INPUT_PROMPT',
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
