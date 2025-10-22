// Agent IDs that should not be rendered in the CLI UI
export const HIDDEN_AGENT_IDS = ['codebuff/context-pruner'] as const

/**
 * Check if an agent ID should be hidden from rendering
 */
export const shouldHideAgent = (agentId: string): boolean => {
  return HIDDEN_AGENT_IDS.some((hiddenId) => agentId.includes(hiddenId))
}
