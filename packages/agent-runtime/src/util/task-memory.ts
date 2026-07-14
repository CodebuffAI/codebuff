import {
  taskMemoryDraftV1Schema,
  taskMemoryV1Schema,
} from '@codebuff/common/types/task-memory'

import type {
  TaskMemoryDraftV1,
  TaskMemoryEvidenceV1,
  TaskMemoryV1,
} from '@codebuff/common/types/task-memory'
import type { AgentReceipt } from '@codebuff/common/types/agent-handoff'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { WorkspaceStateV1 } from '@codebuff/common/types/workspace-state'

const ROOT_CONTEXT_CHARS = 36_000
const CHILD_CONTEXT_CHARS = 14_000

function stableHash(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function uniqueRecent(values: string[], limit: number): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]?.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    output.unshift(value)
    if (output.length >= limit) break
  }
  return output
}

function normalizeEvidence(
  evidence: TaskMemoryEvidenceV1[],
): TaskMemoryEvidenceV1[] {
  const byId = new Map<string, TaskMemoryEvidenceV1>()
  for (const item of evidence) {
    const previous = byId.get(item.id)
    if (!previous || (item.verifiedAt ?? 0) >= (previous.verifiedAt ?? 0)) {
      byId.set(item.id, { ...item })
    }
  }
  const superseded = new Set(
    [...byId.values()].flatMap((item) => item.supersedes ?? []),
  )
  return [...byId.values()]
    .map((item) =>
      superseded.has(item.id) && item.stale !== false
        ? { ...item, stale: true }
        : item,
    )
    .sort((a, b) => (a.verifiedAt ?? 0) - (b.verifiedAt ?? 0))
    .slice(-256)
}

function normalizeDraft(draft: TaskMemoryDraftV1): TaskMemoryDraftV1 {
  return taskMemoryDraftV1Schema.parse({
    ...draft,
    goal: draft.goal.trim(),
    requirements: uniqueRecent(draft.requirements, 64),
    decisions: uniqueRecent(draft.decisions, 64),
    filesInspected: uniqueRecent(draft.filesInspected, 128),
    editsMade: uniqueRecent(draft.editsMade, 128),
    validationResults: uniqueRecent(draft.validationResults, 64),
    reviewReceipts: uniqueRecent(draft.reviewReceipts, 64),
    blockers: uniqueRecent(draft.blockers, 64),
    nextActions: uniqueRecent(draft.nextActions, 32),
    historicalSummary: draft.historicalSummary.trim(),
    evidence: normalizeEvidence(draft.evidence),
  })
}

export function commitTaskMemory(params: {
  current?: TaskMemoryV1
  draft: TaskMemoryDraftV1
  expectedRevision?: number
  now?: number
}): TaskMemoryV1 {
  const { current, expectedRevision } = params
  if (current) {
    if (expectedRevision !== current.revision) {
      throw new Error(
        `Task memory revision conflict: expected ${expectedRevision ?? 'missing'}, current ${current.revision}.`,
      )
    }
  } else if (expectedRevision !== undefined && expectedRevision !== -1) {
    throw new Error(
      `Task memory revision conflict: expected ${expectedRevision}, but no task memory exists.`,
    )
  }
  const normalized = normalizeDraft(params.draft)
  const revision = current ? current.revision + 1 : 0
  const updatedAt = params.now ?? Date.now()
  const checksum = stableHash(
    JSON.stringify({ revision, updatedAt, memory: normalized }),
  )
  return taskMemoryV1Schema.parse({
    ...normalized,
    revision,
    updatedAt,
    checksum,
  })
}

export function mergeTaskMemoryDraft(
  current: TaskMemoryV1 | undefined,
  incoming: TaskMemoryDraftV1,
): TaskMemoryDraftV1 {
  if (!current) return normalizeDraft(incoming)
  return normalizeDraft({
    ...incoming,
    goal: incoming.goal || current.goal,
    requirements: [...current.requirements, ...incoming.requirements],
    decisions: [...current.decisions, ...incoming.decisions],
    filesInspected: [...current.filesInspected, ...incoming.filesInspected],
    editsMade: [...current.editsMade, ...incoming.editsMade],
    validationResults: [
      ...current.validationResults,
      ...incoming.validationResults,
    ],
    reviewReceipts: [...current.reviewReceipts, ...incoming.reviewReceipts],
    blockers: [...current.blockers, ...incoming.blockers],
    nextActions: [...current.nextActions, ...incoming.nextActions],
    historicalSummary: incoming.historicalSummary || current.historicalSummary,
    evidence: [...current.evidence, ...incoming.evidence],
    workspaceRevision: incoming.workspaceRevision ?? current.workspaceRevision,
    workspaceSnapshotId:
      incoming.workspaceSnapshotId ?? current.workspaceSnapshotId,
  })
}

export function mergeAgentReceiptIntoTaskMemory(params: {
  current?: TaskMemoryV1
  receipt: AgentReceipt
  objective?: string
}): TaskMemoryV1 {
  const { current, receipt } = params
  const evidence: TaskMemoryEvidenceV1[] = receipt.evidence.map((item) => ({
    id: item.id,
    kind: item.kind === 'artifact' ? 'handoff' : item.kind,
    summary: item.summary,
    source: item.source ?? `${receipt.role}:${receipt.agentId}`,
    freshnessHash: item.freshnessHash,
    workspaceRevision: item.workspaceRevision ?? receipt.workspaceRevision,
    verifiedAt: Date.now(),
  }))
  const incoming = taskMemoryDraftV1Schema.parse({
    schemaVersion: 1,
    goal: current?.goal ?? params.objective ?? '',
    requirements: current?.requirements ?? [],
    decisions: [],
    filesInspected: evidence
      .filter((item) => item.kind === 'read')
      .map((item) => item.summary),
    editsMade: receipt.changedFiles.map((file) => file.path),
    // Requested commands are pending work, not completed validation evidence.
    validationResults: [],
    reviewReceipts:
      receipt.role === 'reviewer' || receipt.role === 'security-reviewer'
        ? [JSON.stringify(receipt)]
        : [],
    blockers:
      receipt.status === 'blocked' || receipt.status === 'failed'
        ? [...receipt.unresolved, ...receipt.errors.map((error) => error.message)]
        : receipt.unresolved,
    nextActions: receipt.requestedValidation,
    historicalSummary: current?.historicalSummary ?? '',
    evidence,
    workspaceRevision:
      receipt.workspaceRevision ?? current?.workspaceRevision,
    workspaceSnapshotId:
      receipt.workspaceSnapshotId ?? current?.workspaceSnapshotId,
  })
  const merged = mergeTaskMemoryDraft(current, incoming)
  return commitTaskMemory({
    current,
    draft: merged,
    expectedRevision: current?.revision ?? -1,
  })
}

function extractSection(block: string, header: string, nextHeaders: string[]) {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const lookahead = nextHeaders
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const match = block.match(
    new RegExp(`${escaped}:\\s*([\\s\\S]*?)(?=\\n(?:${lookahead}):|$)`),
  )
  return match?.[1]?.trim() ?? ''
}

function parseListSection(
  block: string,
  header: string,
  nextHeaders: string[],
) {
  return extractSection(block, header, nextHeaders)
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean)
}

export function deriveTaskMemoryDraftFromMessages(params: {
  messages: Message[]
  workspaceState?: WorkspaceStateV1
  fallbackSummary?: string
}): TaskMemoryDraftV1 {
  let block = ''
  for (let index = params.messages.length - 1; index >= 0; index -= 1) {
    const message = params.messages[index]
    if (!Array.isArray(message.content)) continue
    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
    const match = text.match(/<knowledge_memory>([\s\S]*?)<\/knowledge_memory>/)
    if (match) {
      block = match[1]
      break
    }
  }
  const headers = [
    'Goal',
    'Requirements',
    'Decisions',
    'Files Inspected',
    'Edits Made',
    'Validation Results',
    'Review Receipts',
    'Blockers',
    'Next Action',
  ]
  const goal = extractSection(block, 'Goal', headers.slice(1))
  const decisions = parseListSection(block, 'Decisions', headers.slice(3))
  const filesInspected = parseListSection(
    block,
    'Files Inspected',
    headers.slice(4),
  )
  const editsMade = parseListSection(block, 'Edits Made', headers.slice(5))
  const validationResults = parseListSection(
    block,
    'Validation Results',
    headers.slice(6),
  )
  const reviewReceipts = parseListSection(
    block,
    'Review Receipts',
    headers.slice(7),
  )
  const blockers = parseListSection(block, 'Blockers', headers.slice(8))
  const nextAction = extractSection(block, 'Next Action', [])
  return normalizeDraft({
    schemaVersion: 1,
    goal,
    requirements: parseListSection(block, 'Requirements', headers.slice(2)),
    decisions,
    filesInspected,
    editsMade,
    validationResults,
    reviewReceipts,
    blockers,
    nextActions: nextAction ? [nextAction] : [],
    historicalSummary: params.fallbackSummary ?? '',
    evidence: [],
    ...(params.workspaceState
      ? {
          workspaceRevision: params.workspaceState.revision,
          workspaceSnapshotId: params.workspaceState.snapshotId,
        }
      : {}),
  })
}

function truncateMemoryText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  if (maxChars <= 32) return value.slice(0, maxChars)
  const head = Math.max(1, Math.floor(maxChars * 0.72))
  const tail = Math.max(1, maxChars - head - 24)
  return `${value.slice(0, head)}...[truncated]...${value.slice(-tail)}`
}

function boundedMemoryList(
  values: string[],
  params: { maxItems: number; maxItemChars: number; maxTotalChars: number },
): string[] {
  const selected = values.slice(-params.maxItems)
  const output: string[] = []
  let used = 0
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const value = truncateMemoryText(selected[index]!, params.maxItemChars)
    if (used + value.length > params.maxTotalChars && output.length > 0) {
      continue
    }
    const remaining = Math.max(1, params.maxTotalChars - used)
    output.unshift(truncateMemoryText(value, remaining))
    used += Math.min(value.length, remaining)
    if (used >= params.maxTotalChars) break
  }
  return output
}

function evidenceIsFresh(
  item: TaskMemoryEvidenceV1,
  workspaceRevision: number | undefined,
): boolean {
  if (item.stale) return false
  if (workspaceRevision === undefined || item.workspaceRevision === undefined) {
    return true
  }
  if (!['read', 'edit', 'validation', 'review'].includes(item.kind)) {
    return true
  }
  return item.workspaceRevision === workspaceRevision
}

function compileBoundedMemoryObject(params: {
  memory: TaskMemoryV1
  agentType?: string | null
  contextWindowTokens?: number
  rootAgent?: boolean
  maxChars: number
}): Record<string, unknown> {
  const { memory, maxChars, rootAgent } = params
  const scale = Math.max(0.22, Math.min(1, maxChars / ROOT_CONTEXT_CHARS))
  const list = (
    values: string[],
    rootItems: number,
    childItems: number,
    fraction: number,
    maxItemChars: number,
  ) =>
    boundedMemoryList(values, {
      maxItems: Math.max(
        1,
        Math.floor((rootAgent ? rootItems : childItems) * scale),
      ),
      maxItemChars: Math.max(120, Math.floor(maxItemChars * scale)),
      maxTotalChars: Math.max(240, Math.floor(maxChars * fraction)),
    })

  const evidenceLimit = Math.max(2, Math.floor((rootAgent ? 64 : 20) * scale))
  const evidence = memory.evidence
    .filter((item) => evidenceIsFresh(item, memory.workspaceRevision))
    .slice(-evidenceLimit)
    .map((item) => ({
      ...item,
      summary: truncateMemoryText(item.summary, Math.max(160, 600 * scale)),
      ...(item.source
        ? {
            source: truncateMemoryText(item.source, Math.max(100, 280 * scale)),
          }
        : {}),
    }))

  return {
    schemaVersion: memory.schemaVersion,
    revision: memory.revision,
    checksum: memory.checksum,
    workspaceRevision: memory.workspaceRevision,
    workspaceSnapshotId: memory.workspaceSnapshotId,
    agentType: params.agentType,
    contextWindowTokens: params.contextWindowTokens,
    goal: truncateMemoryText(
      memory.goal,
      Math.max(400, Math.floor(maxChars * 0.12)),
    ),
    requirements: list(memory.requirements, 64, 24, 0.2, 700),
    decisions: list(memory.decisions, 32, 12, 0.1, 520),
    blockers: list(memory.blockers, 24, 12, 0.13, 620),
    nextActions: list(memory.nextActions, 12, 6, 0.11, 620),
    filesInspected: list(memory.filesInspected, 64, 20, 0.07, 300),
    editsMade: list(memory.editsMade, 64, 20, 0.07, 300),
    validationResults: list(memory.validationResults, 24, 8, 0.07, 420),
    reviewReceipts: list(memory.reviewReceipts, 16, 6, 0.06, 420),
    evidence,
  }
}

export function compileTaskMemoryContext(params: {
  memory: TaskMemoryV1
  agentType?: string | null
  contextWindowTokens?: number
  rootAgent?: boolean
}): string {
  const fixedMax = params.rootAgent ? ROOT_CONTEXT_CHARS : CHILD_CONTEXT_CHARS
  const modelScaledMax = params.contextWindowTokens
    ? Math.max(2_400, Math.floor(params.contextWindowTokens * 4 * 0.1))
    : fixedMax
  const maxChars = Math.min(fixedMax, modelScaledMax)
  const compact = compileBoundedMemoryObject({ ...params, maxChars })
  const serialized = JSON.stringify(compact, null, 2)
  return [
    '<task_memory>',
    'Authoritative structured operational memory compiled for this request. Verify live files before mutation; stale evidence is excluded.',
    serialized,
    '</task_memory>',
  ].join('\n')
}
