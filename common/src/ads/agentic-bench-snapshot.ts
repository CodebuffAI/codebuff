/**
 * The static oracle's view of a bench entry (`agentic-bench-oracle.ts`):
 * every fit-file path at the pin (basenames in `SPONSORED_FIT_FILE_NAMES`),
 * with the text of the files the fit builder reads. Written by
 * `bun scripts/agentic-ad-lab-bench-verify.ts --bench=v2 --snapshots` into
 * `agentic-bench-v2-snapshots.json`; a test checks every pool entry has one.
 */
export type BenchSnapshot = {
  /** Every fit file at the pin is in `files` (none cut by the cap). */
  complete: boolean
  /**
   * Repo-relative path → text. `null`: the file is there but its text is not
   * kept (lockfiles), so a check reading it cannot be decided statically.
   */
  files: Record<string, string | null>
}

export type BenchSnapshots = {
  version: string
  entries: Record<string, BenchSnapshot>
}

export const BENCH_SNAPSHOT_MAX_PATHS = 400
export const BENCH_SNAPSHOT_FILE_BYTES = 64 * 1024

/** A snapshot's text as a Windows checkout (`core.autocrlf=true`) holds it. */
export function benchSnapshotForOs(
  snapshot: BenchSnapshot,
  os: 'darwin' | 'linux' | 'win32',
): BenchSnapshot {
  if (os !== 'win32') return snapshot
  return {
    complete: snapshot.complete,
    files: Object.fromEntries(
      Object.entries(snapshot.files).map(([path, text]) => [
        path,
        text === null ? null : text.replace(/\r?\n/g, '\r\n'),
      ]),
    ),
  }
}
