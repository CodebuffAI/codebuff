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
const TASK_MEMORY_REVIEW_RECEIPT_MAX_CHARS = 4_000

function boundText(value: string, maxChars: number): string {
  const normalized = value.trim()
  if (normalized.length <= maxChars) return normalized
  if (maxChars <= 24) return normalized.slice(0, maxChars)
  return `${normalized.slice(0, maxChars - 15)}...[truncated]`
}

function findStructuredReviewOutput(
  value: unknown,
  depth = 0,
): Record<string, unknown> | undefined {
  if (!value || depth > 8) return undefined
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const found = findStructuredReviewOutput(value[index], depth + 1)
      if (found) return found
    }
    return undefined
  }
  if (typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record.verdict === 'string') return record
  for (const nested of Object.values(record)) {
    const found = findStructuredReviewOutput(nested, depth + 1)
    if (found) return found
  }
  return undefined
}

function boundedStringList(
  values: unknown,
  maxItems: number,
  maxChars: number,
): string[] {
  if (!Array.isArray(values)) return []
  return values
    .flatMap((value) =>
      typeof value === 'string' && value.trim()
        ? [boundText(value, maxChars)]
        : [],
    )
    .slice(0, maxItems)
}

function serializeReviewReceiptForTaskMemory(receipt: AgentReceipt): string {
  const review = findStructuredReviewOutput(receipt.output)
  const reviewedFiles = boundedStringList(review?.reviewedFiles, 4, 160)
  const findings = Array.isArray(review?.findings) ? review.findings : []
  const findingIds = findings
    .flatMap((finding) => {
      if (typeof finding === 'string') return []
      if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
        return []
      }
      const id = (finding as Record<string, unknown>).id
      return typeof id === 'string' && id.trim() ? [boundText(id, 120)] : []
    })
    .slice(0, 4)
  const requirementCoverage = Array.isArray(review?.requirementCoverage)
    ? review.requirementCoverage
    : []
  const requirementStatuses = requirementCoverage.reduce(
    (counts, entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return counts
      }
      const status = (entry as Record<string, unknown>).status
      if (status === 'satisfied') counts.satisfied += 1
      else if (status === 'missing') counts.missing += 1
      else if (status === 'uncertain') counts.uncertain += 1
      return counts
    },
    { satisfied: 0, missing: 0, uncertain: 0 },
  )

  const summary = {
    schemaVersion: 1,
    receiptId: boundText(receipt.receiptId, 96),
    taskId: boundText(receipt.taskId, 96),
    role: receipt.role,
    agentId: boundText(receipt.agentId, 96),
    status: receipt.status,
    ...(receipt.workspaceRevision !== undefined
      ? { workspaceRevision: receipt.workspaceRevision }
      : {}),
    ...(receipt.workspaceSnapshotId
      ? {
          workspaceSnapshotId: boundText(receipt.workspaceSnapshotId, 160),
        }
      : {}),
    review: review
      ? {
          verdict:
            typeof review.verdict === 'string'
              ? boundText(review.verdict, 32)
              : undefined,
          snapshotFingerprint:
            typeof review.snapshotFingerprint === 'string'
              ? boundText(review.snapshotFingerprint, 256)
              : undefined,
          coverage:
            typeof review.coverage === 'string'
              ? boundText(review.coverage, 32)
              : undefined,
          reviewedFiles,
          reviewedFileCount: Array.isArray(review.reviewedFiles)
            ? review.reviewedFiles.length
            : 0,
          findingIds,
          findingCount: findings.length,
          requirementCount: requirementCoverage.length,
          requirementStatuses,
        }
      : undefined,
    changedFiles: receipt.changedFiles
      .map((file) => boundText(file.path, 160))
      .slice(0, 4),
    changedFileCount: receipt.changedFiles.length,
    evidenceCount: receipt.evidence.length,
    unresolved: receipt.unresolved
      .map((value) => boundText(value, 160))
      .slice(0, 2),
    unresolvedCount: receipt.unresolved.length,
    requestedValidation: receipt.requestedValidation
      .map((value) => boundText(value, 160))
      .slice(0, 2),
    errorMessages: receipt.errors
      .map((error) => boundText(error.message, 160))
      .slice(0, 2),
    errorCount: receipt.errors.length,
    truncated:
      reviewedFiles.length <
        (Array.isArray(review?.reviewedFiles)
          ? review.reviewedFiles.length
          : 0) ||
      findingIds.length < findings.length ||
      receipt.changedFiles.length > 4 ||
      receipt.unresolved.length > 2 ||
      receipt.requestedValidation.length > 2 ||
      receipt.errors.length > 2,
  }
  const serialized = JSON.stringify(summary)
  if (serialized.length <= TASK_MEMORY_REVIEW_RECEIPT_MAX_CHARS) {
    return serialized
  }

  return JSON.stringify({
    schemaVersion: 1,
    receiptId: boundText(receipt.receiptId, 64),
    taskId: boundText(receipt.taskId, 64),
    role: receipt.role,
    agentId: boundText(receipt.agentId, 64),
    status: receipt.status,
    ...(receipt.workspaceRevision !== undefined
      ? { workspaceRevision: receipt.workspaceRevision }
      : {}),
    review: review
      ? {
          verdict:
            typeof review.verdict === 'string'
              ? boundText(review.verdict, 32)
              : undefined,
          snapshotFingerprint:
            typeof review.snapshotFingerprint === 'string'
              ? boundText(review.snapshotFingerprint, 160)
              : undefined,
          coverage:
            typeof review.coverage === 'string'
              ? boundText(review.coverage, 32)
              : undefined,
          reviewedFileCount: Array.isArray(review.reviewedFiles)
            ? review.reviewedFiles.length
            : 0,
          findingCount: findings.length,
          requirementCount: requirementCoverage.length,
          requirementStatuses,
        }
      : undefined,
    changedFileCount: receipt.changedFiles.length,
    evidenceCount: receipt.evidence.length,
    unresolvedCount: receipt.unresolved.length,
    requestedValidationCount: receipt.requestedValidation.length,
    errorCount: receipt.errors.length,
    truncated: true,
  })
}

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
  const evidence: TaskMemoryEvidenceV1[] = receipt.evidence
    .slice(-256)
    .map((item) => ({
      id: boundText(item.id, 160) || 'receipt-evidence',
      kind: item.kind === 'artifact' ? 'handoff' : item.kind,
      summary: boundText(item.summary, 2_000),
      source: boundText(
        item.source ?? `${receipt.role}:${receipt.agentId}`,
        1_000,
      ),
      freshnessHash: item.freshnessHash
        ? boundText(item.freshnessHash, 256)
        : undefined,
      workspaceRevision: item.workspaceRevision ?? receipt.workspaceRevision,
      verifiedAt: Date.now(),
    }))
  const blockers =
    receipt.status === 'blocked' || receipt.status === 'failed'
      ? [
          ...receipt.unresolved.map((value) => boundText(value, 2_000)),
          ...receipt.errors.map((error) => boundText(error.message, 2_000)),
        ]
      : receipt.unresolved.map((value) => boundText(value, 2_000))
  const incoming = taskMemoryDraftV1Schema.parse({
    schemaVersion: 1,
    goal: current?.goal ?? boundText(params.objective ?? '', 8_000),
    requirements: current?.requirements ?? [],
    decisions: [],
    filesInspected: evidence
      .filter((item) => item.kind === 'read')
      .slice(-128)
      .map((item) => item.summary),
    editsMade: receipt.changedFiles
      .slice(-128)
      .map((file) => boundText(file.path, 1_500)),
    // Requested commands are pending work, not completed validation evidence.
    validationResults: [],
    reviewReceipts:
      receipt.role === 'reviewer' || receipt.role === 'security-reviewer'
        ? [serializeReviewReceiptForTaskMemory(receipt)]
        : [],
    blockers: blockers.slice(-64),
    nextActions: receipt.requestedValidation
      .slice(-32)
      .map((value) => boundText(value, 2_000)),
    historicalSummary: current?.historicalSummary ?? '',
    evidence,
    workspaceRevision: receipt.workspaceRevision ?? current?.workspaceRevision,
    workspaceSnapshotId:
      receipt.workspaceSnapshotId !== undefined
        ? boundText(receipt.workspaceSnapshotId, 256)
        : current?.workspaceSnapshotId,
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
