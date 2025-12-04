// Agent IDs that should not be rendered in the CLI UI
export const HIDDEN_AGENT_IDS = ['codebuff/context-pruner'] as const

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
  'thinker-selector',
  'best-of-n-selector',
] as const

/**
 * Check if an agent should be collapsed by default
 */
export const shouldCollapseByDefault = (agentType: string): boolean => {
  return COLLAPSED_BY_DEFAULT_AGENT_IDS.some((collapsedId) =>
    agentType.includes(collapsedId),
  )
}

// Agent IDs that should render as simple text instead of full agent boxes
export const SIMPLE_TEXT_AGENT_IDS = [
  'best-of-n-selector',
  'best-of-n-selector-gemini',
] as const

/**
 * Check if an agent should render as simple text instead of a full agent box
 */
export const shouldRenderAsSimpleText = (agentType: string): boolean => {
  return SIMPLE_TEXT_AGENT_IDS.some((simpleTextId) =>
    agentType.includes(simpleTextId),
  )
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
  LITE: 'base2-lite',
  MAX: 'base2-max',
  PLAN: 'base2-plan',
} as const

export type AgentMode = keyof typeof AGENT_MODE_TO_ID
export const AGENT_MODES = Object.keys(AGENT_MODE_TO_ID) as AgentMode[]
