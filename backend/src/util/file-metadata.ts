export interface TokenCallerMap {
  [filePath: string]: {
    [token: string]: string[] // Array of files that call this token
  }
}

/**
 * Appends caller metadata to file content showing which files reference tokens defined in this file
 * @param content The original file content
 * @param filePath The path of the file
 * @param tokenCallers Map of files to their token callers
 * @returns The content with caller metadata appended
 */
export function appendCallerMetadata(
  content: string,
  filePath: string,
  tokenCallers: TokenCallerMap | undefined
): string {
  if (!tokenCallers?.[filePath]) return content

  const callersByToken = tokenCallers[filePath]
  const callerInfo = Object.entries(callersByToken)
    .filter(([_, callers]) => callers.length > 0)
    .map(([token, callers]) => `${token}: ${callers.join(', ')}`)
    .join('\n')

  if (!callerInfo) return content

  console.log('got callerInfo', callerInfo)

  return `${content}\n\n<referenced_by>\n${callerInfo}\n</referenced_by>`
}