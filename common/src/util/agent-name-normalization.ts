export const DEFAULT_ORG_PREFIX = 'CodebuffAI/'

/**
 * Normalizes agent names by stripping only the default CodebuffAI organization prefix
 * Other organization prefixes are preserved to maintain their identity
 * @param agentName - The agent name that may include an org prefix
 * @returns The normalized agent name with only CodebuffAI prefix removed
 */
export function normalizeAgentName(agentName: string): string {
  if (agentName.startsWith(DEFAULT_ORG_PREFIX)) {
    return agentName.slice(DEFAULT_ORG_PREFIX.length)
  }
  return agentName
}

/**
 * Normalizes a list of agent names by stripping the default organization prefix
 * @param agentNames - Array of agent names or single agent name
 * @returns Array of normalized agent names
 */
export function normalizeAgentNames(agentNames: string | string[]): string[] {
  const agentList = Array.isArray(agentNames) ? agentNames : [agentNames]
  return agentList.map(normalizeAgentName)
}

/**
 * Resolves an agent ID by trying multiple strategies:
 * 1. Direct lookup in registry
 * 2. Try with DEFAULT_ORG_PREFIX for spawnable agents
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

  // Try with DEFAULT_ORG_PREFIX for spawnable agents
  // Only add prefix if the agent ID doesn't already contain a slash
  // (to avoid double-prefixing or interfering with other org prefixes)
  if (!agentId.includes('/')) {
    const prefixedAgentId = `${DEFAULT_ORG_PREFIX}${agentId}`
    if (prefixedAgentId in agentRegistry) {
      return prefixedAgentId
    }
  }

  return null
}
