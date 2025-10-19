import { AgentTemplateTypes } from '@codebuff/common/types/session-state'

import type { ToolName } from '@codebuff/common/tools/constants'
import type {
  AgentTemplate,
  StepGenerator,
  StepHandler,
} from '@codebuff/common/types/agent-template'
import type { AgentTemplateType } from '@codebuff/common/types/session-state'

// Re-export for backward compatibility
export type { AgentTemplate, StepGenerator, StepHandler }

const placeholderNames = [
  'AGENT_NAME',
  'AGENTS_PROMPT',
  'CONFIG_SCHEMA',
  'FILE_TREE_PROMPT_SMALL',
  'FILE_TREE_PROMPT',
  'FILE_TREE_PROMPT_LARGE',
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
  placeholderNames.map((name) => [name, `{CODEBUFF_${name}}` as const]),
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

export const baseAgentSubagents: AgentTemplateType[] = [
  AgentTemplateTypes.file_picker,
  AgentTemplateTypes.researcher,
  AgentTemplateTypes.thinker,
  AgentTemplateTypes.reviewer,
] as const
