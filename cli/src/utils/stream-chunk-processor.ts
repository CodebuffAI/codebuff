import { appendTextToAgentBlock, appendTextToRootStream } from './block-operations'

import type { StreamChunkEvent } from './sdk-event-handlers'
import type { ContentBlock } from '../types/chat'

export type ChunkDestination =
  | { type: 'root'; textType: 'text' | 'reasoning' }
  | { type: 'agent'; agentId: string }

export const destinationFromTextEvent = (
  event: { agentId?: string },
): ChunkDestination => {
  if (event.agentId) {
    return { type: 'agent', agentId: event.agentId }
  }
  return { type: 'root', textType: 'text' }
}

export const destinationFromChunkEvent = (
  event: StreamChunkEvent,
): ChunkDestination | null => {
  if (typeof event === 'string') {
    return { type: 'root', textType: 'text' }
  }

  if (event.type === 'subagent_chunk') {
    return { type: 'agent', agentId: event.agentId }
  }

  if (event.type === 'reasoning_chunk') {
    if (event.ancestorRunIds.length === 0) {
      return { type: 'root', textType: 'reasoning' }
    }
    return { type: 'agent', agentId: event.agentId }
  }

  return null
}

export const processTextChunk = (
  blocks: ContentBlock[],
  destination: ChunkDestination,
  text: string,
): ContentBlock[] => {
  if (!text) {
    return blocks
  }

  if (destination.type === 'agent') {
    return appendTextToAgentBlock(blocks, destination.agentId, text)
  }

  return appendTextToRootStream(blocks, {
    type: destination.textType,
    text,
  })
}
