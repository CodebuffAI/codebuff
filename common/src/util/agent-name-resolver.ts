import { AGENT_PERSONAS } from '../constants/agents'

export interface AgentInfo {
  id: string
  displayName: string
  purpose?: string
  isBuiltIn: boolean
}

/**
 * Get all built-in agents (excluding hidden ones)
 */
export function getBuiltInAgents(): AgentInfo[] {
  return Object.entries(AGENT_PERSONAS)
    .filter(([, persona]) => !('hidden' in persona) || !persona.hidden)
    .map(([agentId, persona]) => ({
      id: agentId,
      displayName: persona.displayName,
      purpose: persona.purpose,
      isBuiltIn: true,
    }))
}

/**
 * Convert local agent configs to AgentInfo array
 */
export function getLocalAgents(
  localAgents: Record<string, { displayName: string; purpose?: string }>,
): AgentInfo[] {
  return Object.entries(localAgents).map(([agentId, config]) => ({
    id: agentId,
    displayName: config.displayName,
    purpose: config.purpose,
    isBuiltIn: false,
  }))
}

/**
 * Get all agents (built-in + local)
 */
export function getAllAgents(
  localAgents: Record<string, { displayName: string; purpose?: string }> = {},
): AgentInfo[] {
  return [...getBuiltInAgents(), ...getLocalAgents(localAgents)]
}

/**
 * Resolve display name to agent ID
 */
export function resolveNameToId(
  displayName: string,
  localAgents: Record<string, { displayName: string; purpose?: string }> = {},
): string | null {
  const agents = getAllAgents(localAgents)
  const agent = agents.find(
    (a) => a.displayName.toLowerCase() === displayName.toLowerCase(),
  )
  return agent?.id || null
}

/**
 * Resolve agent ID to display name
 */
function resolveIdToName(
  agentId: string,
  localAgents: Record<string, { displayName: string; purpose?: string }> = {},
): string | null {
  const agents = getAllAgents(localAgents)
  const agent = agents.find((a) => a.id === agentId)
  return agent?.displayName || null
}

/**
 * Get agent display name from ID or name, with fallback
 */
export function getAgentDisplayName(
  agentIdOrName: string,
  localAgents: Record<string, { displayName: string; purpose?: string }> = {},
): string {
  return (
    resolveIdToName(agentIdOrName, localAgents) ||
    (resolveNameToId(agentIdOrName, localAgents)
      ? agentIdOrName
      : agentIdOrName)
  )
}
