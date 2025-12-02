import { getAgentBaseName, moveSpawnAgentBlock } from './message-block-helpers'

import type { SpawnAgentInfo } from '../hooks/stream-state'
import type { ContentBlock } from '../types/chat'

export interface SpawnAgentMatch {
  tempId: string
  info: SpawnAgentInfo
}

export const findMatchingSpawnAgent = (
  spawnAgentsMap: Map<string, SpawnAgentInfo>,
  eventAgentType: string,
): SpawnAgentMatch | null => {
  const eventBaseName = getAgentBaseName(eventAgentType || '')

  for (const [tempId, info] of spawnAgentsMap.entries()) {
    const storedBaseName = getAgentBaseName(info.agentType || '')
    if (eventBaseName === storedBaseName) {
      return { tempId, info }
    }
  }

  return null
}

export const resolveSpawnAgentToReal = (options: {
  blocks: ContentBlock[]
  match: SpawnAgentMatch
  realAgentId: string
  parentAgentId?: string
  params?: Record<string, unknown>
  prompt?: string
}): ContentBlock[] => {
  const {
    blocks,
    match,
    realAgentId,
    parentAgentId,
    params: agentParams,
    prompt,
  } = options

  return moveSpawnAgentBlock(
    blocks,
    match.tempId,
    realAgentId,
    parentAgentId,
    agentParams,
    prompt,
  )
}
