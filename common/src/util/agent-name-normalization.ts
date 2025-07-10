/**
 * Normalizes agent names by stripping organization prefixes (e.g., "CodebuffAI/")
 * @param agentName - The agent name that may include an org prefix
 * @returns The normalized agent name without the org prefix
 */
export function normalizeAgentName(agentName: string): string {
  return agentName.split('/').pop() || agentName
}

/**
 * Normalizes a list of agent names by stripping organization prefixes
 * @param agentNames - Array of agent names or single agent name
 * @returns Array of normalized agent names
 */
export function normalizeAgentNames(agentNames: string | string[]): string[] {
  const agentList = Array.isArray(agentNames) ? agentNames : [agentNames]
  return agentList.map(normalizeAgentName)
}
