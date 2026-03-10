import { createHash, randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

import {
  type CacheDebugCorrelation,
} from '@codebuff/common/util/cache-debug'
import type { CacheDebugUsageData } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { ProviderMetadata } from '@codebuff/common/types/messages/provider-metadata'
import type { JSONValue } from '@codebuff/common/types/json'

type SerializableValue = JSONValue

type CacheDebugMessageSnapshot = {
  role: Message['role']
  content: SerializableValue
  tags?: string[]
  timeToLive?: 'agentStep' | 'userPrompt'
  sentAt?: number
  providerOptions?: ProviderMetadata
  toolCallId?: string
  toolName?: string
}

type CacheDebugPreConversionSnapshot = {
  systemPrompt: string
  toolDefinitions: Record<string, unknown>
  messages: CacheDebugMessageSnapshot[]
}

type CacheDebugProviderRequestSnapshot = {
  provider: string
  rawBody: SerializableValue
  normalized: SerializableValue
}

export type CacheDebugSnapshot = {
  id: string
  index: number
  filename: string
  filePath: string
  timestamp: string
  agentType: string
  runId?: string
  userInputId?: string
  agentStepId?: string
  model?: string
  systemHash?: string
  toolsHash?: string
  preConversion: CacheDebugPreConversionSnapshot
  providerRequest?: CacheDebugProviderRequestSnapshot
  usage?: CacheDebugUsageData
}

function getCacheDebugDir(projectRoot: string) {
  return join(projectRoot, 'debug', 'cache-debug')
}

let cacheDebugCounter = 0

function normalizeForJson(value: unknown): SerializableValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (value instanceof URL) {
    return value.toString() as SerializableValue
  }

  if (value instanceof Uint8Array) {
    return {
      type: 'Uint8Array',
      byteLength: value.byteLength,
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForJson(item))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
        key,
        normalizeForJson(entryValue),
      ]),
    )
  }

  return String(value)
}

function summarizeDataUrl(value: string): SerializableValue {
  const firstComma = value.indexOf(',')
  const header = firstComma >= 0 ? value.slice(0, firstComma) : value
  const payload = firstComma >= 0 ? value.slice(firstComma + 1) : ''
  return {
    type: 'data-url',
    mediaType: header.slice(5).split(';')[0] || 'unknown',
    payloadLength: payload.length,
    preview: payload.slice(0, 32),
  }
}

function summarizeLargeValue(value: SerializableValue): SerializableValue {
  if (Array.isArray(value)) {
    return value.map((item) => summarizeLargeValue(item))
  }

  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && value.startsWith('data:')) {
      return summarizeDataUrl(value)
    }
    return value
  }

  if ('url' in value && typeof value.url === 'string' && value.url.startsWith('data:')) {
    return {
      ...value,
      url: summarizeDataUrl(value.url),
    }
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (key === 'file_data' && typeof entryValue === 'string' && entryValue.startsWith('data:')) {
        return [key, summarizeDataUrl(entryValue)]
      }
      if (key === 'arguments' && typeof entryValue === 'string') {
        return [key, entryValue]
      }
      return [key, summarizeLargeValue(entryValue)]
    }),
  )
}

function stableHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(normalizeForJson(value)))
    .digest('hex')
    .slice(0, 8)
}

function snapshotPath(params: { projectRoot: string; filename: string }) {
  return join(getCacheDebugDir(params.projectRoot), params.filename)
}

function loadSnapshot(params: { projectRoot: string; filename: string }) {
  const path = snapshotPath(params)
  if (!existsSync(path)) {
    return null
  }
  return JSON.parse(readFileSync(path, 'utf8')) as CacheDebugSnapshot
}

function writeSnapshot(params: {
  snapshot: CacheDebugSnapshot
  logger: Logger
}) {
  const { snapshot, logger } = params
  mkdirSync(dirname(snapshot.filePath), { recursive: true })
  writeFileSync(snapshot.filePath, JSON.stringify(snapshot, null, 2))
  logger.debug(
    `[Cache Debug] Wrote enriched snapshot to ${snapshot.filePath}`,
  )
}

function serializeMessage(message: Message): CacheDebugMessageSnapshot {
  return {
    role: message.role,
    content: normalizeForJson(message.content),
    tags: 'tags' in message ? message.tags : undefined,
    timeToLive: 'timeToLive' in message ? message.timeToLive : undefined,
    sentAt: 'sentAt' in message ? message.sentAt : undefined,
    providerOptions: 'providerOptions' in message ? message.providerOptions : undefined,
    toolCallId: 'toolCallId' in message ? message.toolCallId : undefined,
    toolName: 'toolName' in message ? message.toolName : undefined,
  }
}

export function createCacheDebugSnapshot(params: {
  agentType: string
  system: string
  toolDefinitions: Record<string, unknown>
  messages: Message[]
  logger: Logger
  projectRoot: string
  runId?: string
  userInputId?: string
  agentStepId?: string
  model?: string
}): CacheDebugCorrelation {
  const {
    agentType,
    system,
    toolDefinitions,
    messages,
    logger,
    projectRoot,
    runId,
    userInputId,
    agentStepId,
    model,
  } = params

  const cacheDebugDir = getCacheDebugDir(projectRoot)
  mkdirSync(cacheDebugDir, { recursive: true })

  const snapshotId = randomUUID()
  const index = String(cacheDebugCounter++).padStart(3, '0')
  const filename = `${index}-${agentType}-${snapshotId}.json`
  const filePath = snapshotPath({ projectRoot, filename })

  const snapshot: CacheDebugSnapshot = {
    id: snapshotId,
    index: cacheDebugCounter - 1,
    filename,
    filePath,
    timestamp: new Date().toISOString(),
    agentType,
    runId,
    userInputId,
    agentStepId,
    model,
    systemHash: stableHash(system),
    toolsHash: stableHash(toolDefinitions),
    preConversion: {
      systemPrompt: system,
      toolDefinitions,
      messages: messages.map(serializeMessage),
    },
  }

  writeSnapshot({ snapshot, logger })

  return { snapshotId, filename, projectRoot }
}

export function enrichCacheDebugSnapshotWithUsage(params: {
  correlation: CacheDebugCorrelation
  usage: CacheDebugUsageData
  logger: Logger
}) {
  const { correlation, usage, logger } = params
  try {
    const existing = loadSnapshot({
      projectRoot: correlation.projectRoot,
      filename: correlation.filename,
    })
    if (!existing) {
      logger.warn(
        `[Cache Debug] Could not find snapshot ${correlation.filename} to enrich with usage`,
      )
      return
    }

    if (existing.id !== correlation.snapshotId) {
      logger.warn(
        `[Cache Debug] Snapshot ID mismatch while enriching ${correlation.filename} with usage`,
      )
      return
    }

    const updated: CacheDebugSnapshot = {
      ...existing,
      usage,
    }

    writeSnapshot({ snapshot: updated, logger })
  } catch (err) {
    logger.warn({ error: err }, '[Cache Debug] Failed to enrich snapshot with usage')
  }
}

export function enrichCacheDebugSnapshotWithProviderRequest(params: {
  correlation: CacheDebugCorrelation
  provider: string
  rawBody: unknown
  normalized: unknown
  logger: Logger
}) {
  const { correlation, provider, rawBody, normalized, logger } = params
  try {
    const existing = loadSnapshot({
      projectRoot: correlation.projectRoot,
      filename: correlation.filename,
    })
    if (!existing) {
      logger.warn(
        `[Cache Debug] Could not find snapshot ${correlation.filename} to enrich with provider request`,
      )
      return
    }

    if (existing.id !== correlation.snapshotId) {
      logger.warn(
        `[Cache Debug] Snapshot ID mismatch while enriching ${correlation.filename}`,
      )
      return
    }

    const updated: CacheDebugSnapshot = {
      ...existing,
      providerRequest: {
        provider,
        rawBody: summarizeLargeValue(normalizeForJson(rawBody)),
        normalized: summarizeLargeValue(normalizeForJson(normalized)),
      },
    }

    writeSnapshot({ snapshot: updated, logger })
  } catch (err) {
    logger.warn({ error: err }, '[Cache Debug] Failed to enrich snapshot')
  }
}

