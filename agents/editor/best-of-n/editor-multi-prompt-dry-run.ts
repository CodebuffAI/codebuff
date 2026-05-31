function isDryRunObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function dryRunStrReplace(params: {
  path: string
  content: string
  replacements: any[]
}):
  | { success: true; content: string }
  | { success: false; failures: string[] } {
  const { path, content, replacements } = params
  if (replacements.length === 0) {
    return {
      success: false,
      failures: [
        `Invalid replacement structure in propose_str_replace for ${path}`,
      ],
    }
  }

  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n'
  let currentContent = normalizeLineEndings(content)
  const failures: string[] = []

  for (const replacement of replacements) {
    if (
      !isDryRunObject(replacement) ||
      typeof replacement.oldString !== 'string' ||
      typeof replacement.newString !== 'string'
    ) {
      failures.push(
        `Invalid replacement structure in propose_str_replace for ${path}`,
      )
      continue
    }

    const oldString = normalizeLineEndings(replacement.oldString)
    const newString = normalizeLineEndings(replacement.newString)
    if (!oldString) {
      failures.push(`Invalid empty oldString in propose_str_replace for ${path}`)
      continue
    }

    const allowMultiple = replacement.allowMultiple === true
    const match = findDryRunReplacementMatch({
      content: currentContent,
      oldString,
      newString,
      allowMultiple,
    })

    if (!match.success) {
      failures.push(match.failure)
      continue
    }

    currentContent = currentContent.replaceAll(
      match.oldString,
      () => match.newString,
    )
  }

  if (failures.length > 0) {
    return { success: false, failures }
  }

  return {
    success: true,
    content: currentContent.replaceAll('\n', lineEnding),
  }
}

function findDryRunReplacementMatch(params: {
  content: string
  oldString: string
  newString: string
  allowMultiple: boolean
}):
  | { success: true; oldString: string; newString: string }
  | { success: false; failure: string } {
  const { content, oldString, newString, allowMultiple } = params
  const count = content.split(oldString).length - 1
  if (count === 1) {
    return { success: true, oldString, newString }
  }
  if (count > 1) {
    if (allowMultiple) {
      return { success: true, oldString, newString }
    }
    return {
      success: false,
      failure: `Found ${count} occurrences of the oldString during dry-run validation. Use a longer oldString or set allowMultiple to true.`,
    }
  }

  const indentedMatch = findIndentedReplacementMatch({
    content,
    oldString,
    newString,
  })
  if (indentedMatch) return { success: true, ...indentedMatch }

  const whitespaceAgnosticMatch = findWhitespaceAgnosticReplacementMatch({
    content,
    oldString,
  })
  if (whitespaceAgnosticMatch) {
    return {
      success: true,
      oldString: whitespaceAgnosticMatch,
      newString,
    }
  }

  return {
    success: false,
    failure:
      'Could not find exact text to replace during dry-run validation.\nOld string search failed.',
  }
}

function findIndentedReplacementMatch(params: {
  content: string
  oldString: string
  newString: string
}): { oldString: string; newString: string } | null {
  const { content, oldString, newString } = params
  for (let i = 1; i <= 12; i++) {
    const prefix = ' '.repeat(i)
    const searchContent = addLinePrefix(oldString, prefix)
    if (content.includes(searchContent)) {
      return {
        oldString: searchContent,
        newString: addLinePrefix(newString, prefix),
      }
    }
  }
  for (let i = 1; i <= 6; i++) {
    const prefix = '\t'.repeat(i)
    const searchContent = addLinePrefix(oldString, prefix)
    if (content.includes(searchContent)) {
      return {
        oldString: searchContent,
        newString: addLinePrefix(newString, prefix),
      }
    }
  }
  return null
}

function findWhitespaceAgnosticReplacementMatch(params: {
  content: string
  oldString: string
}): string | null {
  const { content, oldString } = params
  const noWhitespaceSearch = oldString.replace(/\s+/g, '')
  if (!noWhitespaceSearch) return null

  const noWhitespaceContent = content.replace(/\s+/g, '')
  const noWhitespaceIndex = noWhitespaceContent.indexOf(noWhitespaceSearch)
  if (noWhitespaceIndex < 0) return null

  let realIndex = 0
  let nonWhitespaceCount = 0
  while (nonWhitespaceCount < noWhitespaceIndex && realIndex < content.length) {
    if (/\S/.test(content[realIndex])) {
      nonWhitespaceCount++
    }
    realIndex++
  }

  let searchLength = 0
  let nonWhitespaceSearchCount = 0
  while (
    nonWhitespaceSearchCount < noWhitespaceSearch.length &&
    realIndex + searchLength < content.length
  ) {
    if (/\S/.test(content[realIndex + searchLength])) {
      nonWhitespaceSearchCount++
    }
    searchLength++
  }

  if (nonWhitespaceSearchCount !== noWhitespaceSearch.length) return null

  const actualContent = content.slice(realIndex, realIndex + searchLength)
  return actualContent && content.includes(actualContent) ? actualContent : null
}

function addLinePrefix(value: string, prefix: string): string {
  return value
    .split('\n')
    .map((line) => (line ? prefix + line : line))
    .join('\n')
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n')
}
