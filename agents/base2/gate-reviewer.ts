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

type ReviewerStructuredVerdict = 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING'
export type ReviewerFinalizationVerdict = 'LOOKS_GOOD' | 'NON_BLOCKING' | ''

type ReviewerCoverage = 'covered' | 'missing' | 'n/a'

type StructuredReviewerOutput = {
  verdict: ReviewerStructuredVerdict
  findings: string[]
  coverage?: ReviewerCoverage
  dimensions?: Record<string, string>
  requirementCoverage?: Array<{ requirement: string; status: string }>
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
  if (structured.length === 0) return []
  const result = structured[structured.length - 1]
  if (result.schemaVersion !== 1) return []
  const issues: string[] = []
  if (result.snapshotFingerprint !== expectedFingerprint) {
    issues.push('BLOCKING: reviewer snapshot fingerprint did not match the reviewed working tree')
  }
  const reviewed = new Set(result.reviewedFiles ?? [])
  const missing = pendingFiles.filter((file) => !reviewed.has(file))
  if (missing.length > 0) {
    issues.push(`BLOCKING: reviewer did not attest to every pending file: ${missing.join(', ')}`)
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
        structuredBlockers.push(`BLOCKING: ${dimension} review dimension failed`)
      }
    }
    for (const requirement of entry.requirementCoverage ?? []) {
      if (requirement.status === 'missing' || requirement.status === 'uncertain') {
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

function extractEmbeddedJsonVerdict(
  text: string,
): 'LOOKS_GOOD' | 'NON_BLOCKING' | '' {
  // Reviewers sometimes emit a short prose preamble before their JSON
  // verdict object (e.g. "I now have full context. ... {\"verdict\":...}").
  // The structured (parsed-object) path only sees parsed JSON nodes, so a
  // verdict embedded in a plain string is invisible to it. Scan the raw text
  // for an embedded verdict object and honor it as a text-mode fallback.
  // Use the LAST match: a reviewer may echo a prior BLOCKING before the final
  // LOOKS_GOOD, and we want the final verdict.
  //
  // NOTE: this intentionally avoids a regex literal. The inline-base2 parity
  // test (gate-reviewer.test.ts) extracts function source via a naive
  // brace-counting scanner that does not understand regex literals or
  // character classes, so a `}` inside a regex pattern (e.g. `[^}]` or `\}`)
  // would prematurely close the extracted function body and break `new
  // Function(...)`. The indexOf + brace-depth scan below contains no regex
  // literal, so it is safe for that extractor. The same scanner also does
  // not understand string literals, so a bare `{` or `}` inside a quoted
  // string (e.g. the opener needle or the character comparisons below)
  // would permanently skew its depth; we therefore build the needle from
  // char codes and compare via charCodeAt(0) so no brace character ever
  // appears inside a string literal in this body.
  const VERDICT_OBJECT_OPEN = String.fromCharCode(123) + '"verdict"'
  const candidates: string[] = []
  let searchFrom = 0
  // Find every `{"verdict"` opener and span to its matching closing `}`.
  // Brace depth is tracked with respect for `\` escapes so `\"` inside JSON
  // string values does not terminate scanning early.
  while (true) {
    const opener = text.indexOf(VERDICT_OBJECT_OPEN, searchFrom)
    if (opener < 0) break
    let depth = 0
    let inString = false
    let escape = false
    let end = -1
    for (let i = opener; i < text.length; i += 1) {
      const ch = text[i]
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      // charCodeAt(0) comparisons avoid bare `{`/`}` inside string literals,
      // which the naive brace-counting extractor would also miscount.
      if (ch.charCodeAt(0) === 123) depth += 1
      else if (ch.charCodeAt(0) === 125) {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end < 0) break
    candidates.push(text.slice(opener, end + 1))
    searchFrom = end + 1
  }
  if (candidates.length === 0) return ''
  const last = candidates[candidates.length - 1]
  try {
    const parsed = JSON.parse(last) as {
      verdict?: unknown
      coverage?: unknown
    }
    const verdict =
      typeof parsed.verdict === 'string'
        ? parsed.verdict.trim().toUpperCase()
        : ''
    const coverage =
      typeof parsed.coverage === 'string'
        ? parsed.coverage.trim().toLowerCase()
        : ''
    // BLOCKING is never a finalization verdict, and missing coverage still
    // blocks regardless of the text verdict (coverage-adequacy contract).
    if (verdict !== 'LOOKS_GOOD' && verdict !== 'NON_BLOCKING') return ''
    if (coverage === 'missing') return ''
    return verdict === 'LOOKS_GOOD' ? 'LOOKS_GOOD' : 'NON_BLOCKING'
  } catch {
    return ''
  }
}

export function getReviewerFinalizationVerdict(
  toolResult: unknown,
): ReviewerFinalizationVerdict {
  // Structured reviewer outputs take precedence so text-mode fallbacks
  // do not accidentally override an explicit JSON verdict.
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

  const texts: string[] = []
  collectStrings(toolResult, texts)
  for (const text of texts) {
    const normalized = stripReviewerPreamble(text)
    if (hasReviewerLineVerdict(normalized, 'LOOKS_GOOD')) return 'LOOKS_GOOD'
    if (hasReviewerLineVerdict(normalized, 'NON_BLOCKING'))
      return 'NON_BLOCKING'
    if (
      /\breviewer gate passed\s*(?:with\s+|\(\s*)LOOKS_GOOD\b/i.test(normalized)
    ) {
      return 'LOOKS_GOOD'
    }
    if (
      /\breviewer gate passed\s*(?:with\s+|\(\s*)NON_BLOCKING\b/i.test(
        normalized,
      )
    ) {
      return 'NON_BLOCKING'
    }
    const embedded = extractEmbeddedJsonVerdict(normalized)
    if (embedded) return embedded
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
                Object.entries(record.dimensions as Record<string, unknown>)
                  .filter((entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
                  ),
              )
            : undefined,
        requirementCoverage: Array.isArray(record.requirementCoverage)
          ? record.requirementCoverage.flatMap((item) => {
              if (!item || typeof item !== 'object') return []
              const requirement = (item as Record<string, unknown>).requirement
              const status = (item as Record<string, unknown>).status
              return typeof requirement === 'string' && typeof status === 'string'
                ? [{ requirement, status: status.toLowerCase() }]
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
