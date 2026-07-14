/**
 * Pure reviewer gate parsing helpers extracted from `base2.ts`.
 *
 * NOTE: equivalent inline copies of these helpers still exist inside
 * `createBase2`'s `handleSteps` generator because that function is
 * serialized via `handleSteps.toString()` and reconstructed with
 * `new Function(...)`. Reconstructed functions lose their module
 * closure, so they cannot reference imports from this file. Keep the
 * two implementations in sync.
 */

import { normalizeGateFilePath } from './gate-paths'

type ReviewerStructuredVerdict = 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING'
export type ReviewerFinalizationVerdict = 'LOOKS_GOOD' | 'NON_BLOCKING' | ''

type ReviewerCoverage = 'covered' | 'missing' | 'n/a'

type StructuredReviewerOutput = {
  verdict: ReviewerStructuredVerdict
  findings: string[]
  coverage?: ReviewerCoverage
  dimensions?: Record<string, string>
  requirementCoverage?: Array<{
    requirement: string
    status: string
    evidence: string[]
  }>
  snapshotFingerprint?: string
  reviewedFiles?: string[]
  schemaVersion?: number
  findingRecords?: ReviewerFindingRecord[]
}

export type ReviewerFindingRecord = {
  id: string
  text: string
  severity?: string
  dimension?: string
  evidence: string[]
  correction?: string
}

export function collectReviewerFindingRecords(
  toolResult: unknown,
): ReviewerFindingRecord[] {
  return collectStructuredReviewerOutputs(toolResult).flatMap(
    (entry) => entry.findingRecords ?? [],
  )
}

export function collectReviewerAttestationIssues(
  toolResult: unknown,
  expectedFingerprint: string,
  pendingFiles: string[],
): string[] {
  const structured = collectStructuredReviewerOutputs(toolResult)
  if (structured.length === 0) {
    return [
      'BLOCKING: reviewer did not return the required structured snapshot attestation',
    ]
  }
  const result = structured[structured.length - 1]
  if (
    typeof result.schemaVersion !== 'number' ||
    !Number.isInteger(result.schemaVersion) ||
    result.schemaVersion <= 0
  ) {
    return ['BLOCKING: reviewer returned an invalid attestation schemaVersion']
  }
  const issues: string[] = []
  if (result.snapshotFingerprint !== expectedFingerprint) {
    issues.push(
      'BLOCKING: reviewer snapshot fingerprint did not match the reviewed working tree',
    )
  }
  const reviewed = new Set(
    (result.reviewedFiles ?? [])
      .map((file) => normalizeGateFilePath(file))
      .filter((file) => file.length > 0),
  )
  const missing = pendingFiles
    .map((file) => normalizeGateFilePath(file))
    .filter((file) => file.length > 0 && !reviewed.has(file))
  if (missing.length > 0) {
    issues.push(
      `BLOCKING: reviewer did not attest to every pending file: ${missing.join(', ')}`,
    )
  }
  return issues
}

export function stripReviewerPreamble(text: string): string {
  let remaining = text.trim()
  // Tolerate reviewers that still emit a closed leading <think>...</think>
  // block (or several) plus surrounding whitespace before the verdict label.
  while (true) {
    const match = remaining.match(/^<think\b[^>]*>[\s\S]*?<\/think>\s*/i)
    if (!match) break
    remaining = remaining.slice(match[0].length).trim()
  }
  return remaining
}

export function collectReviewerBlockers(toolResult: unknown): string[] {
  // First check for structured reviewer outputs (e.g. JSON with a
  // verdict field). When present and BLOCKING, surface findings as the
  // blocker text so existing pinning/messaging logic still works.
  const structured = collectStructuredReviewerOutputs(toolResult)
  const structuredBlockers: string[] = []
  for (const entry of structured) {
    if (entry.verdict === 'BLOCKING') {
      const findings =
        entry.findings.length > 0 ? entry.findings : ['(no findings provided)']
      for (const finding of findings) {
        structuredBlockers.push(`BLOCKING: ${finding}`)
      }
    }
    // Coverage-adequacy contract (M6.3): missing test coverage for a
    // behavior-changing edit is BLOCKING regardless of the text verdict.
    if (entry.coverage === 'missing') {
      structuredBlockers.push(
        'BLOCKING: test coverage missing for changed behavior (add a case to the relevant *.test.ts)',
      )
    }
    for (const [dimension, status] of Object.entries(entry.dimensions ?? {})) {
      if (status.toLowerCase() === 'block') {
        structuredBlockers.push(
          `BLOCKING: ${dimension} review dimension failed`,
        )
      }
    }
    for (const requirement of entry.requirementCoverage ?? []) {
      if (
        requirement.status === 'missing' ||
        requirement.status === 'uncertain'
      ) {
        structuredBlockers.push(
          `BLOCKING: requirement ${requirement.status}: ${requirement.requirement}`,
        )
      }
    }
  }
  if (structuredBlockers.length > 0) return structuredBlockers

  const texts: string[] = []
  collectStrings(toolResult, texts)
  return texts
    .map((text) => stripReviewerPreamble(text))
    .filter((text) => hasReviewerLineVerdict(text, 'BLOCKING'))
}

/**
 * Detects whether the reviewer agent itself crashed (returned an `errorMessage`
 * field, threw, or otherwise produced no usable output) as opposed to running
 * successfully but failing to populate its required structured verdict. The
 * two cases warrant very different operator messages:
 *   - crash    → "reviewer agent crashed; verdict cannot be trusted" (retry or escalate)
 *   - no-verdict → "reviewer returned no structured output" (automated retry)
 *
 * Heuristic: walks the tool-result tree looking for any object that carries an
 * `errorMessage` string or whose `type === 'error'`. Returns the first such
 * message so callers can surface it verbatim. Returns `null` when the result
 * looks like a normal (possibly malformed) reviewer reply.
 */
export function detectReviewerCrash(toolResult: unknown): string | null {
  return findReviewerCrash(toolResult)
}

function findReviewerCrash(value: unknown, depth: number = 0): string | null {
  // Depth cap: reviewer tool results can carry deeply nested tool-call trees
  // (the reviewer itself may have invoked other tools). 8 is well past any
  // realistic agent-result envelope but stops pathological recursion.
  if (depth > 8) return null
  if (!value) return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findReviewerCrash(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  // NOTE: an unrelated nested `errorMessage` (e.g. a failed inner tool call
  // the reviewer made) will also be classified as a reviewer-agent crash.
  // This is acceptable because the caller only consults detectReviewerCrash
  // when the reviewer also failed to emit a recognizable verdict — a
  // reviewer whose inner tool call errored AND who produced no verdict is
  // effectively crashed from the operator's perspective.
  if (typeof record.errorMessage === 'string' && record.errorMessage.trim()) {
    return record.errorMessage.trim()
  }
  if (record.type === 'error' && typeof record.message === 'string') {
    return (
      record.message.trim() || 'reviewer agent reported an unspecified error'
    )
  }
  if (record.type === 'json' && 'value' in record) {
    const nested = findReviewerCrash(record.value, depth + 1)
    if (nested) return nested
  }
  for (const nested of Object.values(record)) {
    const found = findReviewerCrash(nested, depth + 1)
    if (found) return found
  }
  return null
}

export function getReviewerFinalizationVerdict(
  toolResult: unknown,
): ReviewerFinalizationVerdict {
  // Automated gates accept only schema-backed structured reviewer output.
  const structured = collectStructuredReviewerOutputs(toolResult)
  // Coverage-adequacy contract (M6.3): missing coverage blocks finalization
  // even if the text verdict is LOOKS_GOOD / NON_BLOCKING.
  if (structured.some((entry) => entry.coverage === 'missing')) {
    return ''
  }
  for (const entry of structured) {
    if (entry.verdict === 'LOOKS_GOOD') return 'LOOKS_GOOD'
    if (entry.verdict === 'NON_BLOCKING') return 'NON_BLOCKING'
  }

  return ''
}

/**
 * Walk the reviewer tool result for objects that look like a structured
 * reviewer verdict: `{ verdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING', findings?: string | string[], coverage?: 'covered' | 'missing' | 'n/a' }`.
 * Returns an ordered list of normalized entries. Plain text reviewer
 * outputs return an empty list so the existing text-mode logic stays in
 * charge.
 */
function collectStructuredReviewerOutputs(
  value: unknown,
): StructuredReviewerOutput[] {
  const out: StructuredReviewerOutput[] = []
  visitForStructuredVerdict(value, out)
  return out
}

function visitForStructuredVerdict(
  value: unknown,
  out: StructuredReviewerOutput[],
): void {
  if (!value) return
  if (Array.isArray(value)) {
    for (const item of value) visitForStructuredVerdict(item, out)
    return
  }
  if (typeof value !== 'object') return
  const record = value as Record<string, unknown>
  if (record.type === 'json' && 'value' in record) {
    visitForStructuredVerdict(record.value, out)
    return
  }
  const rawVerdict = record.verdict
  if (typeof rawVerdict === 'string') {
    const upper = rawVerdict.trim().toUpperCase()
    if (
      upper === 'LOOKS_GOOD' ||
      upper === 'NON_BLOCKING' ||
      upper === 'BLOCKING'
    ) {
      const findings: string[] = []
      const rawFindings = record.findings
      if (typeof rawFindings === 'string') {
        const trimmed = rawFindings.trim()
        if (trimmed) findings.push(trimmed)
      } else if (Array.isArray(rawFindings)) {
        for (const finding of rawFindings) {
          if (typeof finding === 'string' && finding.trim()) {
            findings.push(finding.trim())
          } else if (finding && typeof finding === 'object') {
            const findingRecord = finding as Record<string, unknown>
            const id =
              typeof findingRecord.id === 'string'
                ? findingRecord.id.trim()
                : ''
            const summary =
              typeof findingRecord.summary === 'string'
                ? findingRecord.summary.trim()
                : typeof findingRecord.text === 'string'
                  ? findingRecord.text.trim()
                  : ''
            if (summary) findings.push(id ? `[${id}] ${summary}` : summary)
          }
        }
      }
      let coverage: ReviewerCoverage | undefined
      const rawCoverage = record.coverage
      if (typeof rawCoverage === 'string') {
        const lower = rawCoverage.trim().toLowerCase()
        if (lower === 'covered' || lower === 'missing' || lower === 'n/a') {
          coverage = lower
        }
      }
      out.push({
        verdict: upper as ReviewerStructuredVerdict,
        findings,
        coverage,
        dimensions:
          record.dimensions && typeof record.dimensions === 'object'
            ? Object.fromEntries(
                Object.entries(
                  record.dimensions as Record<string, unknown>,
                ).filter(
                  (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
                ),
              )
            : undefined,
        requirementCoverage: Array.isArray(record.requirementCoverage)
          ? record.requirementCoverage.flatMap((item) => {
              if (!item || typeof item !== 'object') return []
              const requirement = (item as Record<string, unknown>).requirement
              const status = (item as Record<string, unknown>).status
              const evidence = (item as Record<string, unknown>).evidence
              return typeof requirement === 'string' &&
                typeof status === 'string'
                ? [
                    {
                      requirement,
                      status: status.toLowerCase(),
                      evidence: Array.isArray(evidence)
                        ? evidence.filter(
                            (value): value is string =>
                              typeof value === 'string',
                          )
                        : [],
                    },
                  ]
                : []
            })
          : undefined,
        snapshotFingerprint:
          typeof record.snapshotFingerprint === 'string'
            ? record.snapshotFingerprint
            : undefined,
        reviewedFiles: Array.isArray(record.reviewedFiles)
          ? record.reviewedFiles.filter(
              (file): file is string => typeof file === 'string',
            )
          : undefined,
        schemaVersion:
          typeof record.schemaVersion === 'number'
            ? record.schemaVersion
            : undefined,
        findingRecords: Array.isArray(rawFindings)
          ? rawFindings.flatMap((finding) => {
              if (!finding || typeof finding !== 'object') return []
              const item = finding as Record<string, unknown>
              const id = typeof item.id === 'string' ? item.id.trim() : ''
              const text =
                typeof item.summary === 'string'
                  ? item.summary.trim()
                  : typeof item.text === 'string'
                    ? item.text.trim()
                    : ''
              if (!id || !text) return []
              return [
                {
                  id,
                  text,
                  ...(typeof item.severity === 'string'
                    ? { severity: item.severity }
                    : {}),
                  ...(typeof item.dimension === 'string'
                    ? { dimension: item.dimension }
                    : {}),
                  evidence: Array.isArray(item.evidence)
                    ? item.evidence.filter(
                        (value): value is string => typeof value === 'string',
                      )
                    : [],
                  ...(typeof item.correction === 'string'
                    ? { correction: item.correction }
                    : {}),
                },
              ]
            })
          : undefined,
      })
      return
    }
  }
  for (const nested of Object.values(record)) {
    visitForStructuredVerdict(nested, out)
  }
}

function hasReviewerLineVerdict(
  text: string,
  verdict: ReviewerStructuredVerdict,
): boolean {
  return text
    .split(/\r?\n/)
    .some((line) => new RegExp(`^${verdict}\\b`, 'i').test(line.trim()))
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (!value) return
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out)
    return
  }
  if (typeof value !== 'object') return
  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectStrings(nested, out)
  }
}
