import { logger } from '@codebuff/common/util/logger'
import { createPatch } from 'diff'

import { tryToDoStringReplacementWithExtraIndentation } from './generate-diffs-prompt'

export async function processStrReplace(
  path: string,
  replacements: { old: string; new: string; allowMultiple: boolean }[],
  initialContentPromise: Promise<string | null>,
): Promise<
  | {
      tool: 'str_replace'
      path: string
      content: string
      patch: string
      messages: string[]
    }
  | { tool: 'str_replace'; path: string; error: string }
> {
  const initialContent = await initialContentPromise

  // Process each old/new string pair
  let currentContent = initialContent
  let allPatches: string[] = []
  let messages: string[] = []

  for (const { old: oldStr, new: newStr, allowMultiple } of replacements) {
    // Regular case: require oldStr for replacements
    if (!oldStr) {
      messages.push(
        'The old string was empty, which does not match any content, skipping.',
      )
      continue
    }
    if (currentContent === null) {
      messages.push(
        'The file does not exist, skipping. Please use the write_file tool to create the file.',
      )
      continue
    }

    const lineEnding = currentContent.includes('\r\n') ? '\r\n' : '\n'
    const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
    const normalizedCurrentContent = normalizeLineEndings(currentContent)
    const normalizedOldStr = normalizeLineEndings(oldStr)

    const match = tryMatchOldStr(
      normalizedCurrentContent,
      normalizedOldStr,
      newStr,
      allowMultiple,
    )
    let updatedOldStr: string | null

    if (match.success) {
      updatedOldStr = match.oldStr
    } else {
      messages.push(match.error)
      updatedOldStr = null
    }

    const updatedContent =
      updatedOldStr === null
        ? normalizedCurrentContent
        : normalizedCurrentContent.replaceAll(updatedOldStr, newStr)

    let patch = createPatch(path, normalizedCurrentContent, updatedContent)
    const lines = patch.split('\n')
    const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
    if (hunkStartIndex !== -1) {
      patch = lines.slice(hunkStartIndex).join('\n')
      patch = patch.replaceAll('\n', lineEnding)
      allPatches.push(patch)
    }

    // Update current content for next iteration
    currentContent = updatedContent.replaceAll('\n', lineEnding)
  }

  if (allPatches.length === 0) {
    logger.debug(
      {
        path,
        initialContent,
      },
      `processStrReplace: No change to ${path}`,
    )
    messages.push('No change to the file.')
    return {
      tool: 'str_replace' as const,
      path,
      error: messages.join('\n\n'),
    }
  }

  const finalPatch = allPatches.join('\n')

  logger.debug(
    {
      path,
      newContent: currentContent,
      patch: finalPatch,
      messages,
    },
    `processStrReplace: Updated file ${path}`,
  )

  return {
    tool: 'str_replace' as const,
    path,
    content: currentContent!,
    patch: finalPatch,
    messages,
  }
}

const tryMatchOldStr = (
  initialContent: string,
  oldStr: string,
  newStr: string,
  allowMultiple: boolean,
): { success: true; oldStr: string } | { success: false; error: string } => {
  // count the number of occurrences of oldStr in initialContent
  const count = initialContent.split(oldStr).length - 1
  if (count === 1) {
    return { success: true, oldStr }
  }
  if (!allowMultiple && count > 1) {
    return {
      success: false,
      error: `Found ${count} occurrences of ${JSON.stringify(oldStr)} in the file. Please try again with a longer (more specified) old string or set allowMultiple to true.`,
    }
  }
  if (allowMultiple && count > 1) {
    // For allowMultiple=true with multiple occurrences, use the original oldStr
    return { success: true, oldStr }
  }

  const newChange = tryToDoStringReplacementWithExtraIndentation(
    initialContent,
    oldStr,
    newStr,
  )
  if (newChange) {
    logger.debug('Matched with indentation modification')
    return { success: true, oldStr: newChange.searchContent }
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
        realIndex + searchLength,
      )
      if (initialContent.includes(actualContent)) {
        logger.debug('Matched with whitespace removed')
        return { success: true, oldStr: actualContent }
      }
    }
  }
  return {
    success: false,
    error: `The old string ${JSON.stringify(oldStr)} was not found in the file, skipping. Please try again with a different old string that matches the file content exactly.`,
  }
}
