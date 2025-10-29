export class SubagentResolutionError extends Error {}

export type AgentVersionEntry = {
  id: string
  version: string // stringified
  data: any // must contain optional `spawnableAgents?: string[]`
}

// Resolves subagent references to fully-qualified form and validates them.
// Behavior parity with existing route logic:
// - For already fully-qualified refs (publisher/id@version):
//   - Validate only for same-publisher via `existsInSamePublisher`, else error
// - For simple refs ("id" or "publisher/id"):
//   - Prefer batch version for same publisher
//   - Otherwise resolve to latest published via `getLatestPublishedVersion`
//   - For same-publisher, validate existence via `existsInSamePublisher`
export async function resolveAndValidateSubagents(params: {
  agents: AgentVersionEntry[]
  requestedPublisherId: string
  // Returns latest published version string or null if none
  getLatestPublishedVersion: (
    publisherId: string,
    agentId: string,
  ) => Promise<string | null>
  // Checks if a fully-qualified ref exists within the same publisher context
  existsInSamePublisher: (fullyQualifiedRef: string) => boolean
}): Promise<void> {
  const {
    agents,
    requestedPublisherId,
    getLatestPublishedVersion,
    existsInSamePublisher,
  } = params

  const publishingVersionsById = new Map<string, string>(
    agents.map(({ id, version }) => [id, version]),
  )

  const fqRegex = /^([^/]+)\/(.+)@(.+)$/
  const publisherIdRegex = /^([^/]+)\/(.+)$/

  for (const agentEntry of agents) {
    const agent = agentEntry.data

    // Determine input list with backward-compat (prefer spawnableAgents)
    const inputList: string[] = (agent?.spawnableAgents ??
      agent?.subagents ??
      []) as string[]
    if (!inputList || inputList.length === 0) continue

    const transformed: string[] = []
    // Iterate over normalized list (supports spawnableAgents or legacy subagents)
    for (const sub of inputList) {
      const fqMatch = sub.match(fqRegex)
      if (fqMatch) {
        const fullKey = sub
        // Validate only for same publisher (to match existing behavior)
        const [pub] = fullKey.split('/')
        if (pub === requestedPublisherId) {
          if (!existsInSamePublisher(fullKey)) {
            throw new SubagentResolutionError(
              `Invalid spawnable agent: '${sub}' is not published and not included in this request.`,
            )
          }
        }
        transformed.push(fullKey)
        continue
      }

      // Handle simple refs: 'id' or 'publisher/id'
      let targetPublisher = requestedPublisherId
      let targetId = sub
      const pubMatch = sub.match(publisherIdRegex)
      if (pubMatch) {
        targetPublisher = pubMatch[1]!
        targetId = pubMatch[2]!
      }

      // Prefer batch version for same publisher
      let resolvedVersion: string | null = null
      if (
        targetPublisher === requestedPublisherId &&
        publishingVersionsById.has(targetId)
      ) {
        resolvedVersion = publishingVersionsById.get(targetId)!
      } else {
        resolvedVersion = await getLatestPublishedVersion(
          targetPublisher,
          targetId,
        )
      }

      if (!resolvedVersion) {
        throw new SubagentResolutionError(
          `Invalid spawnable agent: '${sub}' has no published versions to resolve to.`,
        )
      }

      const full = `${targetPublisher}/${targetId}@${resolvedVersion}`

      if (
        targetPublisher === requestedPublisherId &&
        !existsInSamePublisher(full)
      ) {
        throw new SubagentResolutionError(
          `Invalid spawnable agent: '${sub}' resolves to '${full}' but is not published and not included in this request.`,
        )
      }

      transformed.push(full)
    }

    agent.spawnableAgents = transformed
  }
}
