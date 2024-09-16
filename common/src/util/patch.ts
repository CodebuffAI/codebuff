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

  for (let i = 0; i < patchLines.length; i++) {
    const line = patchLines[i]

    if (line.startsWith('@@')) {
      const { contextLines, startIndex, headline } = parseHunk(patchLines, i)
      const headlineIndex = headline ? lines.indexOf(headline) : undefined

      let matchIndex = -1

      if (
        startIndex !== undefined &&
        (headlineIndex === undefined || startIndex > headlineIndex)
      ) {
        matchIndex = findContextMatch(lines, contextLines, startIndex)
      }
      if (
        matchIndex === -1 &&
        headlineIndex !== undefined &&
        headlineIndex > oldIndex
      ) {
        matchIndex = findContextMatch(lines, contextLines, headlineIndex)
      }
      if (matchIndex === -1) {
        matchIndex = findContextMatch(lines, contextLines, oldIndex)
      }
      if (
        startIndex !== undefined &&
        (headlineIndex === undefined || startIndex > headlineIndex)
      ) {
        matchIndex = findContextMatchTrimmed(lines, contextLines, startIndex)
      }
      if (
        matchIndex === -1 &&
        headlineIndex !== undefined &&
        headlineIndex > oldIndex
      ) {
        matchIndex = findContextMatchTrimmed(lines, contextLines, headlineIndex)
      }
      if (
        matchIndex === -1 &&
        headlineIndex !== undefined &&
        headlineIndex > oldIndex
      ) {
        matchIndex = findContextMatchTrimmed(lines, contextLines, oldIndex)
      }
      if (
        matchIndex === -1 &&
        headlineIndex !== undefined &&
        headlineIndex > oldIndex
      ) {
        matchIndex = findPartialContextMatch(lines, contextLines, headlineIndex)
      }
      if (matchIndex === -1) {
        matchIndex = findPartialContextMatch(lines, contextLines, oldIndex)
      }
      if (
        matchIndex === -1 &&
        startIndex !== undefined &&
        startIndex > oldIndex
      ) {
        // We didn't find a match, just try anyway with the parsed line number.
        oldIndex = startIndex
      }
      if (matchIndex !== -1) {
        // Add lines from old content up to the match
        newLines.push(...lines.slice(oldIndex, matchIndex))
        oldIndex = matchIndex
      } else {
        // console.log('No match found for context lines:', contextLines)
      }
    } else if (line.startsWith('-')) {
      const lineContent = line.slice(1)
      if (oldIndex >= lines.length) {
        // Do nothing, just skip the line.
      }
      else if (lineContent.trim() === lines[oldIndex].trim()) {
        // Remove line (skip it in the output)
        oldIndex++
      } else {
        for (let j = 0; j < 10; j++) {
          if (oldIndex + j >= lines.length) {
            break
          }
          if (lineContent.trim() === lines[oldIndex + j].trim()) {
            // Remove matching line if it's later in the file.
            lines.splice(oldIndex + j, 1)
            break
          }
        }
      }
    } else if (line.startsWith('+')) {
      // Add new line
      newLines.push(line.slice(1))
    } else {
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

const parseHunkHeader = (line: string) => {
  let startIndex: number | undefined = undefined
  let lineCount: number | undefined = undefined
  let headline: string | undefined = undefined

  const lineNumberMatch = line.match(/@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/)
  const headlineMatch = line.match(/@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@ (.*)/)
  if (lineNumberMatch) {
    const startLine = parseInt(lineNumberMatch[1], 10)
    startIndex = startLine - 1 // Adjust for 0-based index
    lineCount = parseInt(lineNumberMatch[2], 10)
  } else {
    // console.error('Failed to parse hunk header:', line)
  }
  if (headlineMatch) {
    headline = headlineMatch[1]
  }

  return {
    startIndex,
    lineCount,
    headline,
  }
}

const parseHunk = (patchLines: string[], startIndex: number) => {
  const header = parseHunkHeader(patchLines[startIndex])

  const contextLines: string[] = []
  let initialContextCount = -1
  let j = startIndex + 1
  while (j < patchLines.length && !patchLines[j].startsWith('@@')) {
    if (
      initialContextCount === -1 &&
      (patchLines[j].startsWith('+') || patchLines[j].startsWith('-'))
    ) {
      initialContextCount = j
    } else if (initialContextCount > 0 && !patchLines[j].startsWith('+')) {
      contextLines.push(patchLines[j].slice(1))
    } else break
    j++
  }
  if (initialContextCount === -1) {
    initialContextCount = j
  }

  return {
    ...header,
    contextLines,
    initialContextCount,
  }
}

const findContextMatch = (
  lines: string[],
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
  lines: string[],
  contextLines: string[],
  startIndex: number
): number => {
  for (let i = startIndex; i < lines.length - contextLines.length; i++) {
    if (
      // Match without whitespace, or if the context line is blank.
      contextLines.every(
        (line, j) => lines[i + j].trim() === line.trim() || line.trim() === ''
      )
    ) {
      return i
    }
  }
  return -1
}

const findPartialContextMatch = (
  lines: string[],
  contextLines: string[],
  startIndex: number
): number => {
  const window = contextLines.length
  const contextSet = new Set(contextLines.map((line) => line.trim()))

  let maxMatchCount = 0
  let maxMatchIndex = -1
  for (let i = startIndex; i < lines.length - window; i++) {
    let matchCount = 0
    for (let j = 0; j < window; j++) {
      if (contextSet.has(lines[i + j].trim())) {
        matchCount++
      }
    }
    if (matchCount > maxMatchCount) {
      maxMatchCount = matchCount
      maxMatchIndex = i
    }
  }
  return maxMatchIndex
}
