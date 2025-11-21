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

// Agent IDs that should render as simple tool calls (custom UI)
export const IMPLEMENTOR_AGENT_IDS = [
  'editor-implementor',
  'editor-implementor-gemini',
  'editor-implementor-gpt-5',
] as const

/**
 * Check if an agent is an implementor that should render as a simple tool call
 */
export const isImplementorAgent = (agentType: string): boolean => {
  return IMPLEMENTOR_AGENT_IDS.some((implementorId) =>
    agentType.includes(implementorId),
  )
}

/**
 * Get the display name for an implementor agent
 */
export const getImplementorDisplayName = (agentType: string): string => {
  if (agentType.includes('editor-implementor-gemini')) {
    return 'Gemini'
  }
  if (agentType.includes('editor-implementor-gpt-5')) {
    return 'GPT-5'
  }
  if (agentType.includes('editor-implementor')) {
    return 'Sonnet'
  }
  return 'Implementor'
}

/**
 * The parent agent ID for all root-level agents
 */
export const MAIN_AGENT_ID = 'main-agent'

const agentModes = ['DEFAULT', 'MAX', 'PLAN'] as const
export type AgentMode = (typeof agentModes)[number]
