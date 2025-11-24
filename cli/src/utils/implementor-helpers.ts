import type { AgentContentBlock, ContentBlock } from '../types/chat'

export const IMPLEMENTOR_AGENT_IDS = [
  'editor-implementor',
  'editor-implementor-opus',
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
export const getImplementorDisplayName = (
  agentType: string,
  index?: number,
): string => {
  let baseName = 'Implementor'
  if (agentType.includes('editor-implementor-opus')) {
    baseName = 'Opus'
  } else if (agentType.includes('editor-implementor-gemini')) {
    baseName = 'Gemini'
  } else if (agentType.includes('editor-implementor-gpt-5')) {
    baseName = 'GPT-5'
  } else if (agentType.includes('editor-implementor')) {
    baseName = 'Sonnet'
  }

  // Only add numbering if index is provided
  if (index !== undefined) {
    return `${baseName} #${index + 1}`
  }

  return baseName
}

/**
 * Calculate implementor numbering for siblings by comparing agent types directly
 * Returns the index if there are multiple of the same type, undefined otherwise
 */
export const getImplementorIndex = (
  currentAgentId: string,
  currentAgentType: string,
  siblingBlocks: ContentBlock[],
): number | undefined => {
  if (!isImplementorAgent(currentAgentType)) return undefined

  // Find all siblings with the same agent type
  const sameTypeImplementors = siblingBlocks.filter(
    (block): block is AgentContentBlock =>
      block.type === 'agent' && block.agentType === currentAgentType,
  )

  if (sameTypeImplementors.length <= 1) return undefined

  return sameTypeImplementors.findIndex(
    (block) => block.agentId === currentAgentId,
  )
}
