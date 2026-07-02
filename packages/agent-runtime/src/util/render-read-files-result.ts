export interface TokenCallerMap {
  [filePath: string]: {
    [token: string]: string[] // Array of files that call this token
  }
}

type RenderedFileEntry = {
  path: string
  content: string
  referencedBy?: Record<string, string[]>
}

type RenderedReadResult =
  | { summary: { ok: number; failed: number; requested: number } }
  | RenderedFileEntry

export function renderReadFilesResult(
  files: { path: string; content: string }[],
  tokenCallers: TokenCallerMap,
  requestedCount = files.length,
): RenderedReadResult[] {
  const failed = files.filter((file) => isReadFailure(file.content)).length
  const summary = {
    ok: files.length - failed,
    failed: failed + Math.max(0, requestedCount - files.length),
    requested: requestedCount,
  }

  const fileEntries: RenderedFileEntry[] = files.map((file) => {
    const refs = tokenCallers[file.path]
    const entry: RenderedFileEntry = { path: file.path, content: file.content }
    // Omit `referencedBy` entirely when there are no callers (M7c). The
    // explicit `RenderedFileEntry` annotation keeps the inferred shape
    // compatible with downstream JSONValue consumers (the previous mixed
    // union shape from a conditional spread broke their index signature).
    if (refs && Object.keys(refs).length > 0) {
      entry.referencedBy = refs
    }
    return entry
  })

  return [{ summary }, ...fileEntries]
}

function isReadFailure(content: string): boolean {
  return /^\[(?:FILE_DOES_NOT_EXIST|BLOCKED|FILE_OUTSIDE_PROJECT|FILE_TOO_LARGE|FILE_READ_ERROR)\]/.test(
    content,
  )
}
