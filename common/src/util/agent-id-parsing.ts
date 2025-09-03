/**
 * Parse agent ID to extract publisher, agent name, and version
 * Supports formats:
 * - publisher/agentId[@version]
 * - agentId[@version] (no publisher)
 */
export function parseAgentId(fullAgentId: string): {
  publisherId?: string
  agentId?: string
  version?: string
  givenAgentId: string
} {
  // Check if it's in the publisher/agent-id[@version] format
  const parts = fullAgentId.split('/')

  if (parts.length === 2) {
    // Full format: publisher/agentId[@version]
    const [publisherId, agentNameWithVersion] = parts

    if (!publisherId || !agentNameWithVersion) {
      return {
        publisherId: undefined,
        agentId: undefined,
        version: undefined,
        givenAgentId: fullAgentId,
      }
    }

    // Check for version suffix
    const versionMatch = agentNameWithVersion.match(/^(.+)@(.+)$/)
    if (versionMatch) {
      const [, agentId, version] = versionMatch
      return { publisherId, agentId, version, givenAgentId: fullAgentId }
    }

    return {
      publisherId,
      agentId: agentNameWithVersion,
      givenAgentId: fullAgentId,
    }
  } else if (parts.length === 1) {
    // Just agent name (for backward compatibility)
    const agentNameWithVersion = parts[0]

    if (!agentNameWithVersion) {
      return {
        publisherId: undefined,
        agentId: undefined,
        version: undefined,
        givenAgentId: fullAgentId,
      }
    }

    // Check for version suffix
    const versionMatch = agentNameWithVersion.match(/^(.+)@(.+)$/)
    if (versionMatch) {
      const [, agentId, version] = versionMatch
      return {
        publisherId: undefined,
        agentId,
        version,
        givenAgentId: fullAgentId,
      }
    }

    return {
      publisherId: undefined,
      agentId: agentNameWithVersion,
      version: undefined,
      givenAgentId: fullAgentId,
    }
  }

  return {
    publisherId: undefined,
    agentId: undefined,
    version: undefined,
    givenAgentId: fullAgentId,
  }
}

/**
 * Parse publishded agent ID to extract publisher, agent name, and optionally version
 *
 * If the agent ID is not in the publisher/agent format, return null
 */
export function parsePublishedAgentId(fullAgentId: string): {
  publisherId: string
  agentId: string
  version?: string
} | null {
  const { publisherId, agentId, version } = parseAgentId(fullAgentId)
  if (!publisherId || !agentId) {
    return null
  }
  return {
    publisherId,
    agentId,
    version,
  }
}
