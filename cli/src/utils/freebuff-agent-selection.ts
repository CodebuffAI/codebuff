import { AGENT_MODE_TO_ID, type AgentMode } from './constants'

export function getAgentIdForMode(agentMode: AgentMode): string {
  return AGENT_MODE_TO_ID[agentMode]
}
