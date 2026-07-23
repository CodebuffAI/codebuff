/**
 * Pure gate path / set helpers extracted from `base2.ts`.
 *
 * NOTE: equivalent inline copies of these helpers still exist inside
 * `createBase2`'s `handleSteps` generator because that function is
 * serialized via `handleSteps.toString()` and reconstructed with
 * `new Function(...)`. Reconstructed functions lose their module
 * closure, so they cannot reference imports from this file. Keep the
 * two implementations in sync.
 */

export function normalizeGateFilePath(file: string): string {
  let normalized = file.trim().replace(/\\/g, '/')
  if (!normalized) return ''
  // Reject path traversal: a gate file path must stay inside the project.
  // Any `..` segment (posix or windows, since backslashes were normalized to
  // forward slashes above) is rejected before normalization so it can't be
  // used to point the gate at files outside the cwd.
  if (normalized.split('/').includes('..')) {
    return ''
  }
  if (normalized.startsWith('file://')) {
    normalized = normalized.slice('file://'.length)
  }
  if (/^\/[A-Za-z]:\//.test(normalized)) {
    normalized = normalized.slice(1)
  }
  const cwd =
    typeof process === 'object' &&
    process !== null &&
    typeof process.cwd === 'function'
      ? process.cwd().replace(/\\/g, '/').replace(/\/+$/, '')
      : ''
  const isAbsolute =
    normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)
  if (
    isAbsolute &&
    (!cwd || (normalized !== cwd && !normalized.startsWith(`${cwd}/`)))
  ) {
    return ''
  }
  if (cwd && (normalized === cwd || normalized.startsWith(`${cwd}/`))) {
    normalized = normalized.slice(cwd.length).replace(/^\/+/, '')
  }
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }
  return normalized.trim()
}

export function normalizeGateFileList(files: string[]): string[] {
  const normalizedFiles: string[] = []
  const seen = new Set<string>()
  for (const file of files) {
    const normalized = normalizeGateFilePath(file)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    normalizedFiles.push(normalized)
  }
  return normalizedFiles
}

export function gateFileSetsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const rightFiles = new Set(right)
  return left.every((file) => rightFiles.has(file))
}

// Returns true only for reviewable source files. Everything else — tests,
// generated code, docs, config/data files (including .jsonl bookkeeping like
// EVENTS.jsonl), .env files, and anything under docs/, evals/, or .agents/ —
// is excluded so the final code-reviewer gate never fires on
// bookkeeping/docs/plan artifacts. Mirrors the exclusion style of
// isPublicApiSourceFile in base2.ts but ALSO drops `.jsonl` and `.env`
// basenames. Operates on an already-normalized path (caller normalizes).
export function isReviewableGateFile(filePath: string): boolean {
  if (/__tests__\//.test(filePath)) return false
  if (/\.(test|spec)\.(?:tsx?|jsx?|mjs|cjs)$/.test(filePath)) return false
  if (/\.generated\.tsx?$/.test(filePath)) return false
  if (/\.(md|mdx|json|jsonl|yml|yaml|toml)$/.test(filePath)) return false
  if (/(^|\/)\.env($|\.)/.test(filePath)) return false
  if (filePath.startsWith('docs/')) return false
  if (filePath.startsWith('evals/') || filePath.startsWith('.agents/')) {
    return false
  }
  return /\.(?:tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|kts|cs|fs|vb)$/.test(
    filePath,
  )
}

export function selectReviewableGateFiles(files: string[]): string[] {
  const reviewableFiles: string[] = []
  const seen = new Set<string>()
  for (const file of files) {
    const normalized = normalizeGateFilePath(file)
    if (!normalized || seen.has(normalized)) continue
    if (!isReviewableGateFile(normalized)) continue
    seen.add(normalized)
    reviewableFiles.push(normalized)
  }
  return reviewableFiles
}

// Co-changed test files (the complement of isReviewableGateFile's test
// exclusion). These are surfaced to the final reviewer as readable
// "coverage evidence" so it can confirm the changed behavior is tested,
// WITHOUT adding tests to the reviewed-for-defects fingerprint set.
// Operates on an already-normalized path (caller normalizes).
export function isCoverageEvidenceFile(filePath: string): boolean {
  if (/__tests__\//.test(filePath)) return true
  if (/\.(test|spec)\.(?:tsx?|jsx?|mjs|cjs)$/.test(filePath)) return true
  return false
}

export function selectCoverageEvidenceFiles(files: string[]): string[] {
  const evidenceFiles: string[] = []
  const seen = new Set<string>()
  for (const file of files) {
    const normalized = normalizeGateFilePath(file)
    if (!normalized || seen.has(normalized)) continue
    if (!isCoverageEvidenceFile(normalized)) continue
    seen.add(normalized)
    evidenceFiles.push(normalized)
  }
  return evidenceFiles
}
