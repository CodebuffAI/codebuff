export interface TokenCallerMap {
  [filePath: string]: {
    [token: string]: string[] // Array of files that call this token
  }
}

export function renderReadFilesResult(
  files: { path: string; content: string }[],
  tokenCallers: TokenCallerMap,
) {
  return files.map((file) => {
    return {
      path: file.path,
      content: file.content,
      referencedBy: tokenCallers[file.path] ?? {},
    }
  })
}
