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
  placeholderNames.map((name) => [name, `{CODEBUFF_${name}}` as const]),
) as PlaceholderType<typeof placeholderNames>
export type PlaceholderValue = (typeof PLACEHOLDER)[keyof typeof PLACEHOLDER]

export const placeholderValues = Object.values(PLACEHOLDER)

export const baseAgentToolNames: ToolName[] = [
  'add_subgoal',
  'analyze_test_requirements',
  'browser_logs',
  'code_search',
  'create_plan',
  'create_task_checklist',
  'end_turn',
  'read_files',
  'run_terminal_command',
  'smart_find_files',
  'spawn_agents',
  'str_replace',
  'think_deeply',
  'update_subgoal',
  'write_file',
] as const

export const baseAgentSubagents: AgentTemplateType[] = [
  AgentTemplateTypes.file_picker,
  AgentTemplateTypes.researcher,
  AgentTemplateTypes.thinker,
  AgentTemplateTypes.reviewer,
] as const
