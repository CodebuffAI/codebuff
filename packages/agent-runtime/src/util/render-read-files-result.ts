export interface TokenCallerMap {
  [filePath: string]: {
    [token: string]: string[] // Array of files that call this token
  }
}

export function renderReadFilesResult(
  files: { path: string; content: string }[],
  tokenCallers: TokenCallerMap,
  requestedCount = files.length,
) {
  const failed = files.filter((file) => isReadFailure(file.content)).length
  const summary = {
    ok: files.length - failed,
    failed: failed + Math.max(0, requestedCount - files.length),
    requested: requestedCount,
  }

  return [
    { summary },
    ...files.map((file) => ({
      path: file.path,
      content: file.content,
      referencedBy: tokenCallers[file.path] ?? {},
    })),
  ]
}

function isReadFailure(content: string): boolean {
  return /^\[(?:FILE_DOES_NOT_EXIST|BLOCKED|FILE_OUTSIDE_PROJECT|FILE_TOO_LARGE|FILE_READ_ERROR)\]/.test(
    content,
  )
}
