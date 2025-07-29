/**
 * Resolves an agent ID by trying multiple strategies:
 * 1. Direct lookup in registry
 * 2. Try with CodebuffAI/ prefix for spawnable agents
 * 3. Return null if not found
 * 
 * This provides a more robust alternative to string concatenation
 * and handles the common case where users reference spawnable agents
 * without the org prefix.
 */
export function resolveAgentId(
  agentId: string,
  agentRegistry: Record<string, any>
): string | null {
  // Handle empty or invalid input
  if (!agentId || typeof agentId !== 'string') {
    return null
  }

  // Try direct lookup first
  if (agentId in agentRegistry) {
    return agentId
  }

  // Try with CodebuffAI prefix for spawnable agents
  // Only add prefix if the agent ID doesn't already contain a slash
  // (to avoid double-prefixing or interfering with other org prefixes)
  if (!agentId.includes('/')) {
    const prefixedAgentId = `CodebuffAI/${agentId}`
    if (prefixedAgentId in agentRegistry) {
      return prefixedAgentId
    }
  }

  return null
}
