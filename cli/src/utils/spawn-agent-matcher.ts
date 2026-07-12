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
  spawnToolCallId?: string,
  spawnIndex?: number,
): SpawnAgentMatch | null => {
  if (spawnToolCallId !== undefined && spawnIndex !== undefined) {
    const tempId = `${spawnToolCallId}-${spawnIndex}`
    const info = spawnAgentsMap.get(tempId)
    return info ? { tempId, info } : null
  }

  const eventBaseName = getAgentBaseName(eventAgentType || '')
  const matches: SpawnAgentMatch[] = []
  for (const [tempId, info] of spawnAgentsMap.entries()) {
    const storedBaseName = getAgentBaseName(info.agentType || '')
    if (eventBaseName === storedBaseName) {
      matches.push({ tempId, info })
    }
  }
  // Legacy events have no correlation metadata. Only reconcile by type when
  // the match is unique; choosing the first same-type spawn swaps cards when
  // concurrent identical agents start out of order.
  return matches.length === 1 ? matches[0] : null
}

export const resolveSpawnAgentToReal = (options: {
  blocks: ContentBlock[]
  match: SpawnAgentMatch
  realAgentId: string
  realAgentType?: string
  parentAgentId?: string
  params?: Record<string, unknown>
  prompt?: string
}): ContentBlock[] => {
  const {
    blocks,
    match,
    realAgentId,
    realAgentType,
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
    realAgentType,
  )
}
