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
