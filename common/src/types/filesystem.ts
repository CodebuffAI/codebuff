import type fs from 'fs'

export type CodebuffFileContent = string | NodeJS.ArrayBufferView

export type CodebuffRangeReadResult = {
  data: Uint8Array
  /** Byte offset immediately after the returned range. */
  endExclusive: number
}

export type CodebuffTextRangeReadResult = {
  /** Exact bytes for the returned complete lines, without implicit decoding. */
  data: Uint8Array
  /** First returned 1-indexed line. */
  startLine: number
  /** Last returned 1-indexed line, or zero when no lines were returned. */
  endLine: number
  /** Authoritative total visible line count for the file snapshot. */
  totalLines: number
  /** False when maxBytes prevented returning the full requested line span. */
  complete: boolean
}

export type CodebuffConditionalCommitOptions = {
  /** `null` requires the destination to still be absent. */
  expectedHash: string | null
}

export type CodebuffConditionalCommitResult =
  | { applied: true }
  | { applied: false; actualHash: string | null }

export type CodebuffConditionalDeleteResult = CodebuffConditionalCommitResult

export type CodebuffConditionalMoveOptions = {
  expectedSourceHash: string
  /** Guarded moves currently require an absent destination. */
  expectedDestinationHash: null
}

export type CodebuffConditionalMoveResult =
  | { applied: true }
  | {
      applied: false
      actualSourceHash: string | null
      actualDestinationHash: string | null
    }

/**
 * Optional operations that a filesystem adapter may implement with native or
 * cooperative compare-and-swap authority. Their absence is meaningful:
 * callers must not emulate the guarantee with a check-then-write sequence.
 */
export type CodebuffFileSystemCapabilities = {
  /** Whether process-backed tools observe the same workspace as this adapter. */
  hostProcessView?: boolean
  /**
   * Describes the authority behind conditional mutations. `cooperative_cas`
   * serializes participating Openbuff processes, but cannot exclude arbitrary
   * external filesystem writers.
   */
  mutationAuthority?: 'cooperative_cas' | 'native_atomic'
  readRange?: (
    path: fs.PathLike,
    start: number,
    endExclusive: number,
  ) => Promise<CodebuffRangeReadResult>
  /**
   * Bounded line-oriented text read. Implementations must never return more
   * than maxBytes and must derive all metadata from one coherent snapshot.
   */
  readTextRange?: (
    path: fs.PathLike,
    startLine: number,
    endLine: number,
    maxBytes: number,
  ) => Promise<CodebuffTextRangeReadResult>
  conditionalCommit?: (
    path: fs.PathLike,
    data: CodebuffFileContent,
    options: CodebuffConditionalCommitOptions,
  ) => Promise<CodebuffConditionalCommitResult>
  conditionalDelete?: (
    path: fs.PathLike,
    options: { expectedHash: string },
  ) => Promise<CodebuffConditionalDeleteResult>
  /**
   * Move a source under the adapter's declared mutation authority only when
   * its content hash still matches and the destination is still absent.
   * Implementations must not replace an existing destination.
   */
  conditionalMove?: (
    source: fs.PathLike,
    destination: fs.PathLike,
    options: CodebuffConditionalMoveOptions,
  ) => Promise<CodebuffConditionalMoveResult>
  createFileExclusive?: (
    path: fs.PathLike,
    data: CodebuffFileContent,
  ) => Promise<void>
  /** Native metadata-preserving rename when source and destination share a filesystem. */
  renameFile?: (source: fs.PathLike, destination: fs.PathLike) => Promise<void>
  /** Restore portable permission bits after rollback/recreation. */
  setMode?: (path: fs.PathLike, mode: number) => Promise<void>
}

/** File system used for Codebuff SDK.
 *
 * Compatible with `fs.promises` from the `'fs'` module.
 */
export type CodebuffFileSystem = Pick<
  typeof fs.promises,
  | 'mkdir'
  | 'readdir'
  | 'readFile'
  | 'realpath'
  | 'stat'
  | 'unlink'
  | 'writeFile'
> &
  CodebuffFileSystemCapabilities
