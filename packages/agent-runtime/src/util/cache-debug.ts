import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

function getCacheDebugDir(projectRoot: string) {
  return join(projectRoot, 'debug', 'cache-debug')
}
let cacheDebugCounter = 0

export function writeCacheDebugSnapshot(params: {
  agentType: string
  system: string
  toolDefinitions: Record<string, unknown>
  messages: Message[]
  logger: Logger
  projectRoot: string
}) {
  const { agentType, system, toolDefinitions, messages, logger, projectRoot } = params
  const cacheDebugDir = getCacheDebugDir(projectRoot)
  try {
    mkdirSync(cacheDebugDir, { recursive: true })
    const index = String(cacheDebugCounter++).padStart(3, '0')
    const filename = `${index}-${agentType}-${Date.now()}.json`
    const snapshot = {
      index: cacheDebugCounter - 1,
      timestamp: new Date().toISOString(),
      agentType,
      systemPrompt: system,
      toolDefinitions,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        tags: 'tags' in m ? m.tags : undefined,
        timeToLive: 'timeToLive' in m ? m.timeToLive : undefined,
        sentAt: 'sentAt' in m ? m.sentAt : undefined,
      })),
    }
    writeFileSync(
      join(cacheDebugDir, filename),
      JSON.stringify(snapshot, null, 2),
    )
    logger.debug(
      `[Cache Debug] Wrote full snapshot to ${cacheDebugDir}/${filename}`,
    )
  } catch (err) {
    logger.warn({ error: err }, '[Cache Debug] Failed to write snapshot')
  }
}
