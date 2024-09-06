export const applyPatch = (oldContent: string, patch: string): string => {
  const lines = oldContent.split('\n')
  const pathWithoutFinalNewLine = patch.endsWith('\n')
    ? patch.slice(0, -1)
    : patch
  const patchLines = pathWithoutFinalNewLine.split('\n').slice(4)
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
      // Start of a new hunk
      const contextLines: string[] = []
      let j = i + 1
      while (j < patchLines.length && !patchLines[j].startsWith('@@')) {
        if (!patchLines[j].startsWith('-') && !patchLines[j].startsWith('+')) {
          contextLines.push(patchLines[j].slice(1))
        } else break
        j++
      }

      const matchIndex = findContextMatch(contextLines, oldIndex)
      if (matchIndex !== -1) {
        // Add lines from old content up to the match
        newLines.push(...lines.slice(oldIndex, matchIndex))
        oldIndex = matchIndex
      } else {
        const matchIndexTrimmed = findContextMatchTrimmed(
          contextLines,
          oldIndex
        )
        if (matchIndexTrimmed !== -1) {
          // Add lines from old content up to the match
          newLines.push(...lines.slice(oldIndex, matchIndexTrimmed))
          oldIndex = matchIndexTrimmed
        } else {
          console.log('No match found for context lines:', contextLines)
        }
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
        console.log('Skipping ending context lines')
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
