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
    while (lines[oldIndex] === REMOVED_LINE) {
      oldIndex++
    }

    const patchLine = patchLines[i]

    if (patchLine.startsWith('@@')) {
      const { contextLines, startIndex, headline } = parseHunk(patchLines, i)
      const headlineIndex = headline ? lines.indexOf(headline) : undefined
      const matchIndex = getMatchIndex(
        lines,
        contextLines,
        oldIndex,
        startIndex,
        headlineIndex
      )

      // Add lines from old content up to the match
      newLines.push(...lines.slice(oldIndex, matchIndex))
      oldIndex = matchIndex
    } else if (patchLine.startsWith('-')) {
      const lineContent = patchLine.slice(1)
      if (oldIndex >= lines.length) {
        // Do nothing, just skip the line.
      } else if (lineContent.trim() === lines[oldIndex].trim()) {
        // Remove line (skip it in the output)
        oldIndex++
      } else {
        for (let j = 0; j < 10; j++) {
          if (oldIndex + j >= lines.length) {
            break
          }
          if (lineContent.trim() === lines[oldIndex + j].trim()) {
            // Remove matching line if it's later in the file.
            lines[oldIndex + j] = REMOVED_LINE
            break
          }
        }
      }
    } else if (patchLine.startsWith('+')) {
      // Add new line
      newLines.push(patchLine.slice(1))
    } else {
      const nextHunkDist = patchLines
        .slice(i + 1)
        .findIndex((line) => line.startsWith('@@'))
      const nextHunkIndex =
        nextHunkDist === -1 ? patchLines.length : i + nextHunkDist + 1
      if (
        patchLines
          .slice(i + 1, nextHunkIndex)
          .every((line) => !line.startsWith('+') && !line.startsWith('-'))
      ) {
        // Skip ending context lines
        continue
      }
      const lineContent = patchLine.slice(1)
      // Context line
      for (let j = 0; j < 10; j++) {
        if (oldIndex + j >= lines.length) {
          if (oldIndex < lines.length) {
            // No match, just use the corresponding old line.
            newLines.push(lines[oldIndex])
            oldIndex++
          }
          break
        }
        const oldLine = lines[oldIndex + j]
        if (lineContent.trim() === oldLine.trim()) {
          // Remove matching line if it's later in the file.
          lines[oldIndex + j] = REMOVED_LINE
          newLines.push(oldLine)
          break
        }
      }
    }
  }

  // Add any remaining lines from the old content
  newLines.push(...lines.slice(oldIndex))

  return newLines.filter((line) => line !== REMOVED_LINE).join('\n')
}

const REMOVED_LINE = '[REMOVED_LINE]'

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
  let j = startIndex + 1
  while (j < patchLines.length && !patchLines[j].startsWith('@@')) {
    if (!patchLines[j].startsWith('+')) {
      contextLines.push(patchLines[j].slice(1))
      j++
    } else break
  }

  return {
    ...header,
    contextLines,
  }
}

const findContextMatch = (
  lines: string[],
  contextLines: string[],
  startIndex: number
) => {
  for (let i = startIndex; i < lines.length - contextLines.length; i++) {
    if (contextLines.every((line, j) => lines[i + j] === line)) {
      return i
    }
  }
  return undefined
}
const findContextMatchTrimmed = (
  lines: string[],
  contextLines: string[],
  startIndex: number
) => {
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
  return undefined
}

const findPartialContextMatch = (
  lines: string[],
  contextLines: string[],
  startIndex: number
) => {
  const window = contextLines.length
  const contextSet = new Set(contextLines.map((line) => line.trim()))

  let maxMatchCount = 0
  let maxMatchIndex: number | undefined = undefined
  for (let i = startIndex; i < lines.length - window; i++) {
    let matchCount = 0
    for (let j = 0; j < window; j++) {
      if (contextSet.has(lines[i + j].trim())) {
        matchCount++
      }
    }
    if (maxMatchCount === undefined || matchCount > maxMatchCount) {
      maxMatchCount = matchCount
      maxMatchIndex = i
    }
  }
  return maxMatchIndex
}

const getMatchIndex = (
  lines: string[],
  contextLines: string[],
  oldIndex: number,
  startIndex: number | undefined,
  headlineIndex: number | undefined
): number => {
  let matchIndex: number | undefined

  if (
    startIndex !== undefined &&
    (headlineIndex === undefined || startIndex > headlineIndex)
  ) {
    matchIndex = findContextMatch(lines, contextLines, startIndex)
  }
  if (
    matchIndex === undefined &&
    headlineIndex !== undefined &&
    headlineIndex > oldIndex
  ) {
    matchIndex = findContextMatch(lines, contextLines, headlineIndex)
  }
  if (matchIndex === undefined) {
    matchIndex = findContextMatch(lines, contextLines, oldIndex)
  }
  if (
    startIndex !== undefined &&
    (headlineIndex === undefined || startIndex > headlineIndex)
  ) {
    matchIndex = findContextMatchTrimmed(lines, contextLines, startIndex)
  }
  if (
    matchIndex === undefined &&
    headlineIndex !== undefined &&
    headlineIndex > oldIndex
  ) {
    matchIndex = findContextMatchTrimmed(lines, contextLines, headlineIndex)
  }
  if (
    matchIndex === undefined &&
    headlineIndex !== undefined &&
    headlineIndex > oldIndex
  ) {
    matchIndex = findContextMatchTrimmed(lines, contextLines, oldIndex)
  }
  if (
    matchIndex === undefined &&
    headlineIndex !== undefined &&
    headlineIndex > oldIndex
  ) {
    matchIndex = findPartialContextMatch(lines, contextLines, headlineIndex)
  }
  if (matchIndex === undefined) {
    matchIndex = findPartialContextMatch(lines, contextLines, oldIndex)
  }
  if (
    matchIndex === undefined &&
    startIndex !== undefined &&
    startIndex > oldIndex
  ) {
    // We didn't find a match, just try anyway with the parsed line number.
    matchIndex = startIndex
  }

  return matchIndex ?? oldIndex
}
