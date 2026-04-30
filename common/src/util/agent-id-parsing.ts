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
 * Parse published agent ID to extract publisher, agent name, and optionally version
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

/**
 * Normalizes an agent ID for lookup by accepting underscores as aliases for
 * hyphens in the agent-name segment. Publisher IDs and version strings are
 * preserved as written.
 */
export function normalizeAgentIdForLookup(fullAgentId: string): string {
  const parts = fullAgentId.split('/')
  if (parts.length > 2) {
    return fullAgentId
  }

  const normalizeNameWithVersion = (agentNameWithVersion: string) => {
    const versionStart = agentNameWithVersion.indexOf('@')
    const agentName =
      versionStart === -1
        ? agentNameWithVersion
        : agentNameWithVersion.slice(0, versionStart)
    const version =
      versionStart === -1 ? '' : agentNameWithVersion.slice(versionStart)

    return `${agentName.replace(/_/g, '-')}${version}`
  }

  if (parts.length === 1) {
    return normalizeNameWithVersion(fullAgentId)
  }

  const [publisherId, agentNameWithVersion] = parts
  if (!publisherId || !agentNameWithVersion) {
    return fullAgentId
  }

  return `${publisherId}/${normalizeNameWithVersion(agentNameWithVersion)}`
}
