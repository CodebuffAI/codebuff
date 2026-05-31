import { createPatch } from 'diff'

import { tryToDoStringReplacementWithExtraIndentation } from './generate-diffs-prompt'

import type { Logger } from '@codebuff/common/types/contracts/logger'

function normalizeLineEndings(params: { str: string }): string {
  return params.str.replace(/\r\n/g, '\n')
}

const FAILED_EDIT_RECOVERY_GUIDANCE = [
  'Recovery required: stop retrying this edit from memory.',
  'Before attempting another str_replace on this file, re-read the exact current lines with read_files and copy the current text into oldString.',
  'If the file has changed since your last read, base the next edit on the fresh read, not on the failed oldString.',
].join('\n')

function addFailedEditRecoveryGuidance(error: string): string {
  return `${error}\n\n${FAILED_EDIT_RECOVERY_GUIDANCE}`
}

export async function processStrReplace(params: {
  path: string
  replacements: {
    oldString: string
    newString: string
    allowMultiple: boolean
  }[]
  initialContentPromise: Promise<string | null>
  logger: Logger
}): Promise<
  | {
      tool: 'str_replace'
      path: string
      content: string
      patch: string
      messages: string[]
    }
  | { tool: 'str_replace'; path: string; error: string }
> {
  const { path, replacements, initialContentPromise, logger } = params
  const initialContent = await initialContentPromise
  if (initialContent === null) {
    return {
      tool: 'str_replace',
      path,
      error:
        'The file does not exist, skipping. Please use the write_file tool to create the file.',
    }
  }

  // Process each oldString/newString pair
  let currentContent = initialContent
  let messages: string[] = []
  const lineEnding = currentContent.includes('\r\n') ? '\r\n' : '\n'

  for (const {
    oldString: oldStr,
    newString: newStr,
    allowMultiple,
  } of replacements) {
    // Regular case: require oldStr for replacements
    if (!oldStr) {
      messages.push(
        'The old string was empty, which does not match any content, skipping.',
      )
      continue
    }

    const normalizedCurrentContent = normalizeLineEndings({
      str: currentContent,
    })
    const normalizedOldStr = normalizeLineEndings({ str: oldStr })
    const normalizedNewStr = normalizeLineEndings({ str: newStr })

    const match = tryMatchOldStr({
      initialContent: normalizedCurrentContent,
      oldStr: normalizedOldStr,
      newStr: normalizedNewStr,
      allowMultiple,
      logger,
    })
    let updatedOldStr: string | null

    if (match.success) {
      updatedOldStr = match.oldStr
    } else {
      messages.push(match.error)
      updatedOldStr = null
    }

    currentContent =
      updatedOldStr === null
        ? normalizedCurrentContent
        : normalizedCurrentContent.replaceAll(
            updatedOldStr,
            () => normalizedNewStr,
          )
  }

  currentContent = currentContent.replaceAll('\n', lineEnding)

  // If no successful replacements occurred, return error
  if (initialContent === currentContent) {
    logger.debug(
      {
        path,
        initialContent,
      },
      `processStrReplace: No change to ${path}`,
    )
    messages.push('No change to the file')
    return {
      tool: 'str_replace' as const,
      path,
      error: addFailedEditRecoveryGuidance(messages.join('\n\n')),
    }
  }

  let patch = createPatch(path, initialContent, currentContent)
  const lines = patch.split('\n')
  const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
  if (hunkStartIndex !== -1) {
    patch = lines.slice(hunkStartIndex).join('\n')
  }
  const finalPatch = patch

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

function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length
  const len2 = s2.length
  if (len1 === 0) return len2
  if (len2 === 0) return len1

  let prev = new Int32Array(len2 + 1)
  let curr = new Int32Array(len2 + 1)

  for (let j = 0; j <= len2; j++) {
    prev[j] = j
  }

  for (let i = 1; i <= len1; i++) {
    curr[0] = i
    const char1 = s1.charCodeAt(i - 1)
    for (let j = 1; j <= len2; j++) {
      const cost = char1 === s2.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1, // Insertion
        prev[j] + 1,     // Deletion
        prev[j - 1] + cost // Substitution
      )
    }
    const temp = prev
    prev = curr
    curr = temp
  }

  return prev[len2]
}

function findClosestMatch(params: {
  initialContent: string
  oldStr: string
}): { closestBlock: string; startLine: number; similarity: number } | null {
  const { initialContent, oldStr } = params
  if (!oldStr || !initialContent) return null

  const fileLines = initialContent.split('\n')
  const oldLines = oldStr.split('\n')
  const L = oldLines.length

  // 1. Tokenize/Word frequency representation for fast screening
  // Extract alphanumeric words/tokens (length >= 3)
  const oldWords = Array.from(new Set(oldStr.toLowerCase().match(/[a-zA-Z0-9_]{3,}/g) || []))

  if (oldWords.length === 0) {
    // Fall back to unique non-whitespace characters if no words
    const uniqueChars = Array.from(new Set(oldStr.replace(/\s+/g, '').toLowerCase()))
    for (const char of uniqueChars) {
      oldWords.push(char)
    }
  }

  // If we still have nothing, we can't search
  if (oldWords.length === 0) return null

  // 2. Score each line in fileLines by number of word/token matches
  const lineScores = new Float32Array(fileLines.length)
  for (let i = 0; i < fileLines.length; i++) {
    const lowerLine = fileLines[i].toLowerCase()
    let score = 0
    for (const word of oldWords) {
      if (lowerLine.includes(word)) {
        score++
      }
    }
    lineScores[i] = score
  }

  // 3. Score windows of lines using word hit density
  // We'll evaluate window sizes from Math.max(1, L - 3) to L + 3
  const candidates: { startLine: number; endLine: number; score: number }[] = []
  const minK = Math.max(1, L - 3)
  const maxK = L + 3

  for (let K = minK; K <= maxK; K++) {
    if (K > fileLines.length) continue

    // Slide window of size K
    let currentWindowScore = 0
    for (let i = 0; i < K; i++) {
      currentWindowScore += lineScores[i]
    }

    candidates.push({ startLine: 0, endLine: K - 1, score: currentWindowScore })

    for (let i = 1; i <= fileLines.length - K; i++) {
      currentWindowScore = currentWindowScore - lineScores[i - 1] + lineScores[i + K - 1]
      candidates.push({ startLine: i, endLine: i + K - 1, score: currentWindowScore })
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score)

  // Keep top 12 candidates to perform the precise Levenshtein distance on
  const topCandidates = candidates.slice(0, 12)
  if (topCandidates.length === 0) return null

  let bestMatch: {
    closestBlock: string
    startLine: number
    similarity: number
  } | null = null

  // We want to avoid evaluating near-identical overlapping ranges repeatedly if they are just 1 line off
  const evaluatedRanges = new Set<string>()

  for (const cand of topCandidates) {
    const rangeKey = `${cand.startLine}-${cand.endLine}`
    if (evaluatedRanges.has(rangeKey)) continue
    evaluatedRanges.add(rangeKey)

    const candidateLines = fileLines.slice(cand.startLine, cand.endLine + 1)
    const candidateText = candidateLines.join('\n')

    const dist = levenshteinDistance(candidateText, oldStr)
    const maxLen = Math.max(candidateText.length, oldStr.length)
    const similarity = maxLen === 0 ? 0 : 1 - dist / maxLen

    if (bestMatch === null || similarity > bestMatch.similarity) {
      bestMatch = {
        closestBlock: candidateText,
        startLine: cand.startLine + 1, // 1-indexed for humans/models
        similarity,
      }
    }
  }

  return bestMatch
}

const tryMatchOldStr = (params: {
  initialContent: string
  oldStr: string
  newStr: string
  allowMultiple: boolean
  logger: Logger
}): { success: true; oldStr: string } | { success: false; error: string } => {
  const { initialContent, oldStr, newStr, allowMultiple, logger } = params
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

  const newChange = tryToDoStringReplacementWithExtraIndentation({
    oldFileContent: initialContent,
    searchContent: oldStr,
    replaceContent: newStr,
  })
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

  const closest = findClosestMatch({ initialContent, oldStr })
  let errorMsg = `The old string ${JSON.stringify(oldStr)} was not found in the file, skipping. Please try again with a different old string that matches the file content exactly.`
  if (closest && closest.similarity >= 0.2) {
    errorMsg += `\n\nDid you mean to match this block around line ${closest.startLine}?\n\`\`\`\n${closest.closestBlock}\n\`\`\``
  }

  return {
    success: false,
    error: errorMsg,
  }
}
