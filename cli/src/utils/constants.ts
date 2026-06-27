import type { ToolName } from '@codebuff/sdk'

// Agent IDs that should not be rendered in the CLI UI
export const HIDDEN_AGENT_IDS = ['codebuff/context-pruner'] as const

// Tool names that should be collapsed by default when rendered
// Uses ToolName type to ensure only valid tool names are added
export const COLLAPSED_BY_DEFAULT_TOOL_NAMES: readonly ToolName[] = [
  'set_output',
] as const

/**
 * Check if a tool should be collapsed by default
 */
export const shouldCollapseToolByDefault = (toolName: string): boolean => {
  return COLLAPSED_BY_DEFAULT_TOOL_NAMES.includes(toolName as ToolName)
}

/**
 * Check if an agent ID should be hidden from rendering
 */
export const shouldHideAgent = (agentId: string): boolean => {
  return HIDDEN_AGENT_IDS.some((hiddenId) => agentId.includes(hiddenId))
}

// Agent IDs that should be collapsed by default when they start
export const COLLAPSED_BY_DEFAULT_AGENT_IDS = [
  'file-picker',
  'code-reviewer-selector',
  'basher',
  'code-searcher',
  'directory-lister',
  'glob-matcher',
  'researcher-web',
  'researcher-docs',
] as const

/**
 * Check if an agent should be collapsed by default
 */
export const shouldCollapseByDefault = (agentType: string): boolean => {
  return COLLAPSED_BY_DEFAULT_AGENT_IDS.some((collapsedId) =>
    agentType.includes(collapsedId),
  )
}

/**
 * Rules for collapsing child agents when spawned by specific parent agents.
 * Key: parent agent type pattern, Value: array of child agent type patterns to collapse
 */
export const PARENT_CHILD_COLLAPSE_RULES: Record<string, string[]> = {}

/**
 * Check if a child agent should be collapsed when spawned by a specific parent
 */
export const shouldCollapseForParent = (
  childAgentType: string,
  parentAgentType: string | undefined,
): boolean => {
  if (!parentAgentType) {
    return false
  }

  for (const [parentPattern, childPatterns] of Object.entries(
    PARENT_CHILD_COLLAPSE_RULES,
  )) {
    if (parentAgentType.includes(parentPattern)) {
      for (const childPattern of childPatterns) {
        if (childAgentType.includes(childPattern)) {
          return true
        }
      }
    }
  }

  return false
}

// Agent IDs that should render as simple text instead of full agent boxes
export const SIMPLE_TEXT_AGENT_IDS = [] as const

/**
 * Check if an agent should render as simple text instead of a full agent box
 */
export const shouldRenderAsSimpleText = (agentType: string): boolean => {
  return SIMPLE_TEXT_AGENT_IDS.some((simpleTextId) =>
    agentType.includes(simpleTextId),
  )
}

// Agent IDs that show progress-focused previews.
export const MULTI_PROMPT_EDITOR_IDS = [] as const

/**
 * Check if an agent should show progress-focused preview when collapsed
 */
export const isMultiPromptEditor = (agentType: string): boolean => {
  return MULTI_PROMPT_EDITOR_IDS.some((id) => agentType.includes(id))
}

/**
 * The parent agent ID for all root-level agents
 */
export const MAIN_AGENT_ID = 'main-agent'

/**
 * Mapping from agent mode to agent ID.
 * Single source of truth for all agent modes (order = cycling order).
 */
export const AGENT_MODE_TO_ID = {
  DEFAULT: 'base2',
  PLAN: 'base2-plan',
  EXECUTE_PLAN: 'base2-execute-plan',
} as const

export type AgentMode = keyof typeof AGENT_MODE_TO_ID
export const AGENT_MODES = Object.keys(AGENT_MODE_TO_ID) as AgentMode[]

/**
 * Maps CLI agent mode to cost mode for billing.
 */
export const AGENT_MODE_TO_COST_MODE = {
  DEFAULT: 'normal',
  PLAN: 'normal',
  EXECUTE_PLAN: 'normal',
} as const satisfies Record<
  AgentMode,
  'normal' | 'max' | 'experimental' | 'ask'
>
