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
