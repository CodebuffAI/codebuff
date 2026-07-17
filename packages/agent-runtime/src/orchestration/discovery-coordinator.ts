import { createHash } from 'node:crypto'

import { discoveryCoverageV1Schema } from '@codebuff/common/types/discovery-coverage'

import type { DiscoveryCoverageV1 } from '@codebuff/common/types/discovery-coverage'

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function canonicalizeDiscoveryInput(value: unknown, depth = 0): unknown {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object') return value
  if (depth >= 8) return '[nested input omitted]'
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeDiscoveryInput(item, depth + 1))
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalizeDiscoveryInput(item, depth + 1)]),
  )
}

export function buildDiscoveryQuestion(params: {
  agentType: string
  prompt?: string
  objective?: string
  spawnParams?: Record<string, unknown>
}): string {
  const explicitQuestion = [params.prompt, params.objective]
    .find((value) => typeof value === 'string' && value.trim().length > 0)
    ?.trim()
  if (explicitQuestion) return explicitQuestion

  const canonicalParams = canonicalizeDiscoveryInput(params.spawnParams)
  const serializedParams = canonicalParams
    ? JSON.stringify(canonicalParams)
    : ''
  if (serializedParams && serializedParams !== '{}') {
    return `${params.agentType} parameters: ${serializedParams.slice(0, 4_000)}`
  }
  return `${params.agentType} discovery`
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').trim()
}

function looksLikePath(value: string): boolean {
  return (
    value.length < 1_000 &&
    !value.includes('\n') &&
    /(?:^|\/)[^/]+\.[A-Za-z0-9]{1,12}(?::\d+)?$/.test(value)
  )
}

function extractCandidates(value: unknown): Map<string, Set<string>> {
  const candidates = new Map<string, Set<string>>()
  const add = (raw: string, reason: string) => {
    const withoutLine = raw.replace(/:\d+(?::\d+)?$/, '')
    const path = normalizePath(withoutLine)
    if (!looksLikePath(path)) return
    const reasons = candidates.get(path) ?? new Set<string>()
    reasons.add(reason)
    candidates.set(path, reasons)
  }
  const visit = (item: unknown, key = 'result', depth = 0): void => {
    if (!item || depth > 10) return
    if (typeof item === 'string') {
      add(item, key)
      return
    }
    if (Array.isArray(item)) {
      for (const nested of item) visit(nested, key, depth + 1)
      return
    }
    if (typeof item !== 'object') return
    for (const [nestedKey, nested] of Object.entries(
      item as Record<string, unknown>,
    )) {
      visit(nested, nestedKey, depth + 1)
    }
  }
  visit(value)
  return candidates
}

export function planDiscoveryBatch(params: {
  existing?: DiscoveryCoverageV1
  query: string
  result: unknown
  workspaceRevision?: number
}): DiscoveryCoverageV1 {
  const queryHash = hash(
    params.query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim(),
  )
  const extracted = extractCandidates(params.result)
  const workspaceChanged =
    params.existing !== undefined &&
    params.workspaceRevision !== undefined &&
    params.existing.workspaceRevision !== params.workspaceRevision
  const previousByPath = new Map<
    string,
    DiscoveryCoverageV1['candidates'][number]
  >(
    (params.existing?.candidates ?? []).map((candidate) => {
      return [
        candidate.path,
        workspaceChanged ? { ...candidate, stale: true } : candidate,
      ] as const
    }),
  )
  for (const [path, reasons] of extracted) {
    const previous = previousByPath.get(path)
    previousByPath.set(path, {
      path,
      symbols: previous?.symbols ?? [],
      reasons: [...new Set([...(previous?.reasons ?? []), ...reasons])],
      verified: previous?.verified ?? false,
      stale: false,
      workspaceRevision: params.workspaceRevision,
    })
  }
  return discoveryCoverageV1Schema.parse({
    schemaVersion: 1,
    revision: (params.existing?.revision ?? -1) + 1,
    workspaceRevision: params.workspaceRevision,
    queryHash,
    candidates: [...previousByPath.values()].slice(-512),
    shards: params.existing?.shards ?? [],
    coveredDomains: params.existing?.coveredDomains ?? [],
    unresolvedGaps: [...previousByPath.values()]
      .filter((candidate) => !candidate.verified || candidate.stale)
      .map((candidate) => candidate.path)
      .slice(0, 128),
  })
}

function normalizeQuestion(question: string): string {
  const stop = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'to',
    'of',
    'for',
    'in',
    'on',
    'please',
    'find',
    'search',
    'read',
  ])
  return question
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((token) => token && !stop.has(token))
    .sort()
    .join(' ')
}

export function claimDiscoveryShard(params: {
  existing?: DiscoveryCoverageV1
  agentType: string
  question: string
  workspaceRevision?: number
}): { state: DiscoveryCoverageV1; shardKey: string } {
  const question =
    params.question.trim() ||
    `${params.agentType.trim() || 'unknown-agent'} discovery`
  const existing =
    params.existing ??
    planDiscoveryBatch({
      query: question,
      result: [],
      workspaceRevision: params.workspaceRevision,
    })
  const shardKey = hash(
    `${params.agentType}:${normalizeQuestion(question)}:${params.workspaceRevision ?? 'unknown'}`,
  )
  const duplicate = existing.shards.find(
    (shard) =>
      shard.key === shardKey &&
      (shard.status === 'active' || shard.status === 'completed'),
  )
  if (duplicate) {
    throw new Error(
      `Duplicate discovery shard ${shardKey} is already ${duplicate.status}. Consume the existing discovery receipt instead of respawning it.`,
    )
  }
  const state = discoveryCoverageV1Schema.parse({
    ...existing,
    revision: existing.revision + 1,
    shards: [
      ...existing.shards,
      {
        key: shardKey,
        agentType: params.agentType,
        question,
        status: 'active',
        assignedAt: Date.now(),
      },
    ].slice(-256),
  })
  return { state, shardKey }
}

export function completeDiscoveryShard(params: {
  existing?: DiscoveryCoverageV1
  shardKey?: string
  status: 'completed' | 'failed' | 'interrupted'
}): DiscoveryCoverageV1 | undefined {
  if (!params.existing || !params.shardKey) return params.existing
  return discoveryCoverageV1Schema.parse({
    ...params.existing,
    revision: params.existing.revision + 1,
    shards: params.existing.shards.map((shard) =>
      shard.key === params.shardKey
        ? { ...shard, status: params.status, completedAt: Date.now() }
        : shard,
    ),
  })
}
