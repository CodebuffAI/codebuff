import { normalizeAgentName } from './agent-name-normalization'
import { AGENT_PERSONAS } from '../constants/agents'

export interface AgentInfo {
  id: string
  name: string
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
      name: persona.name,
      purpose: persona.purpose,
      isBuiltIn: true,
    }))
}

/**
 * Convert local agent configs to AgentInfo array
 */
export function getLocalAgents(
  localAgents: Record<string, { name: string; purpose?: string }>
): AgentInfo[] {
  return Object.entries(localAgents).map(([agentId, config]) => ({
    id: normalizeAgentName(agentId),
    name: config.name,
    purpose: config.purpose,
    isBuiltIn: false,
  }))
}

/**
 * Get all agents (built-in + local)
 */
export function getAllAgents(
  localAgents: Record<string, { name: string; purpose?: string }> = {}
): AgentInfo[] {
  return [...getBuiltInAgents(), ...getLocalAgents(localAgents)]
}

/**
 * Resolve display name to agent ID
 */
export function resolveNameToId(
  displayName: string,
  localAgents: Record<string, { name: string; purpose?: string }> = {}
): string | null {
  const agents = getAllAgents(localAgents)
  const agent = agents.find(
    (a) => a.name.toLowerCase() === displayName.toLowerCase()
  )
  return agent?.id || null
}

/**
 * Resolve agent ID to display name
 */
export function resolveIdToName(
  agentId: string,
  localAgents: Record<string, { name: string; purpose?: string }> = {}
): string | null {
  const normalizedId = normalizeAgentName(agentId)
  const agents = getAllAgents(localAgents)
  const agent = agents.find((a) => a.id === normalizedId)
  return agent?.name || null
}

/**
 * Get agent display name from ID or name, with fallback
 */
export function getAgentDisplayName(
  agentIdOrName: string,
  localAgents: Record<string, { name: string; purpose?: string }> = {}
): string {
  return (
    resolveIdToName(agentIdOrName, localAgents) ||
    (resolveNameToId(agentIdOrName, localAgents)
      ? agentIdOrName
      : agentIdOrName)
  )
}

/**
 * Get agent ID from display name or ID, with fallback
 */
export function getAgentId(
  agentIdOrName: string,
  localAgents: Record<string, { name: string; purpose?: string }> = {}
): string {
  return (
    resolveNameToId(agentIdOrName, localAgents) ||
    normalizeAgentName(agentIdOrName)
  )
}
