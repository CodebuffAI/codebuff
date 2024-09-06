export const applyPatch = (oldContent: string, patch: string): string => {
  const lines = oldContent.split('\n')

  const patchLines = patch.split('\n')
  const indexOfFirstHunk = patchLines.findIndex((line) => line.startsWith('@@'))
  patchLines.splice(0, indexOfFirstHunk)
  if (patch.endsWith('\n')) {
    patchLines.pop()
  }

  const newLines: string[] = []
  let oldIndex = 0

  const findContextMatch = (
    contextLines: string[],
    startIndex: number
  ): number => {
    for (let i = startIndex; i < lines.length - contextLines.length; i++) {
      if (contextLines.every((line, j) => lines[i + j] === line)) {
        return i
      }
    }
    return -1
  }
  const findContextMatchTrimmed = (
    contextLines: string[],
    startIndex: number
  ): number => {
    for (let i = startIndex; i < lines.length - contextLines.length; i++) {
      if (
        contextLines.every((line, j) => lines[i + j].trim() === line.trim())
      ) {
        return i
      }
    }
    return -1
  }

  for (let i = 0; i < patchLines.length; i++) {
    const line = patchLines[i]

    if (line.startsWith('@@')) {
      let startLineToTry: number | undefined
      // Parse the line numbers from the hunk header
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/)
      if (match) {
        const startLine = parseInt(match[1], 10)
        startLineToTry = startLine - 1 // Adjust for 0-based index
      } else {
        // console.error('Failed to parse hunk header:', line)
      }
      // Start of a new hunk
      const contextLines: string[] = []
      let j = i + 1
      while (j < patchLines.length && !patchLines[j].startsWith('@@')) {
        if (!patchLines[j].startsWith('-') && !patchLines[j].startsWith('+')) {
          contextLines.push(patchLines[j].slice(1))
        } else break
        j++
      }

      let matchIndex = findContextMatch(
        contextLines,
        startLineToTry ?? oldIndex
      )
      if (matchIndex === -1) {
        matchIndex = findContextMatch(contextLines, oldIndex)
      }
      if (matchIndex === -1) {
        matchIndex = findContextMatchTrimmed(contextLines, oldIndex)
      }
      // TODO: try matching with the after context lines?
      if (
        matchIndex === -1 &&
        startLineToTry !== undefined &&
        startLineToTry > oldIndex
      ) {
        // We didn't find a match, just try anyway with the parsed line number.
        oldIndex = startLineToTry
      }
      if (matchIndex !== -1) {
        // Add lines from old content up to the match
        newLines.push(...lines.slice(oldIndex, matchIndex))
        oldIndex = matchIndex
      } else {
        // console.log('No match found for context lines:', contextLines)
      }
    } else if (line.startsWith('-')) {
      // Remove line (skip it in the output)
      oldIndex++
    } else if (line.startsWith('+')) {
      // Add new line
      newLines.push(line.slice(1))
    } else if (!line.startsWith('\\')) {
      if (
        patchLines.slice(i + 1, i + 4).some((line) => line.startsWith('@@ '))
      ) {
        // console.log('Skipping ending context lines')
        // Skip ending context lines
        continue
      }
      // Context line
      newLines.push(line.slice(1))
      oldIndex++
    }
  }

  // Add any remaining lines from the old content
  newLines.push(...lines.slice(oldIndex))

  return newLines.join('\n')
}
