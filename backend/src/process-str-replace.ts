import { logger } from 'common/util/logger'
import { tryToDoStringReplacementWithExtraIndentation } from './generate-diffs-prompt'
import { createPatch } from 'diff'

export async function processStrReplace(
  path: string,
  oldStr: string,
  newStr: string,
  initialContentPromise: Promise<string | null>
) {
  const initialContent = await initialContentPromise
  if (initialContent === null) return null
  if (!oldStr) return null

  const lineEnding = initialContent.includes('\r\n') ? '\r\n' : '\n'
  const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
  const normalizedInitialContent = normalizeLineEndings(initialContent)
  const normalizedOldStr = normalizeLineEndings(oldStr)

  const updatedOldStr = tryMatchOldStr(
    normalizedInitialContent,
    normalizedOldStr,
    newStr
  )
  if (!updatedOldStr) return null

  const updatedContent = normalizedInitialContent.replaceAll(
    updatedOldStr,
    newStr
  )

  let patch = createPatch(path, normalizedInitialContent, updatedContent)
  const lines = patch.split('\n')
  const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
  if (hunkStartIndex !== -1) {
    patch = lines.slice(hunkStartIndex).join('\n')
  } else {
    logger.debug(
      {
        path,
        initialContent,
        changes: updatedContent,
        patch,
      },
      `processStrReplace: No change to ${path}`
    )
    return null
  }
  logger.debug(
    {
      path,
      editSnippet: updatedContent,
      newContent: updatedContent,
      patch,
    },
    `processStrReplace: Updated file ${path}`
  )

  const patchOriginalLineEndings = patch.replaceAll('\n', lineEnding)
  const updatedContentOriginalLineEndings = updatedContent.replaceAll(
    '\n',
    lineEnding
  )

  return {
    tool: 'str_replace' as const,
    path,
    content: updatedContentOriginalLineEndings,
    patch: patchOriginalLineEndings,
  }
}

const tryMatchOldStr = (
  initialContent: string,
  oldStr: string,
  newStr: string
) => {
  if (initialContent.includes(oldStr)) {
    return oldStr
  }

  const newChange = tryToDoStringReplacementWithExtraIndentation(
    initialContent,
    oldStr,
    newStr
  )
  if (newChange) {
    logger.debug('Matched with indentation modification')
    return newChange.searchContent
  } else {
    // Try matching without any whitespace as a last resort
    const noWhitespaceSearch = oldStr.replace(/\s+/g, '')
    const noWhitespaceOld = initialContent.replace(/\s+/g, '')
    const noWhitespaceIndex = noWhitespaceOld.indexOf(noWhitespaceSearch)

    if (noWhitespaceIndex >= 0) {
      // Count non-whitespace characters to find the real position
      let realIndex = 0
      let nonWhitespaceCount = 0
      while (nonWhitespaceCount < noWhitespaceIndex) {
        if (initialContent[realIndex].match(/\S/)) {
          nonWhitespaceCount++
        }
        realIndex++
      }

      // Count non-whitespace characters in search content to find length
      let searchLength = 0
      let nonWhitespaceSearchCount = 0
      while (
        nonWhitespaceSearchCount < noWhitespaceSearch.length &&
        realIndex + searchLength < initialContent.length
      ) {
        if (initialContent[realIndex + searchLength].match(/\S/)) {
          nonWhitespaceSearchCount++
        }
        searchLength++
      }

      // Find the actual content with original whitespace
      const actualContent = initialContent.slice(
        realIndex,
        realIndex + searchLength
      )
      if (initialContent.includes(actualContent)) {
        logger.debug('Matched with whitespace removed')
        return actualContent
      }
    }
  }
  return null
}
