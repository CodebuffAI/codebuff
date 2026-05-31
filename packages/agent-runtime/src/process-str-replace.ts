import { createHash } from 'crypto'

import { createPatch } from 'diff'

import { tryToDoStringReplacementWithExtraIndentation } from './generate-diffs-prompt'

import type { Logger } from '@codebuff/common/types/contracts/logger'

type ReplacementReadCapability = {
  startLine: number
  endLine: number
  hash: string
}

function normalizeLineEndings(params: { str: string }): string {
  return params.str.replace(/\r\n/g, '\n')
}

export function getContentHash(content: string): string {
  return `sha256:${createHash('sha256').update(normalizeLineEndings({ str: content })).digest('hex')}`
}

const READ_CAPABILITY_TOKEN_PREFIX = 'cap.'

/**
 * Encodes a read capability as a single self-contained opaque token. The token
 * embeds {startLine, endLine, rangeHash} so the model only ever copies ONE
 * value from a read_files header instead of three coupled fields it could
 * mispair. read_files mints these tokens; str_replace decodes and re-validates
 * them statelessly against the current file (the hash is still the authority).
 */
export function encodeReadCapabilityToken(params: {
  startLine: number
  endLine: number
  hash: string
}): string {
  const { startLine, endLine, hash } = params
  return (
    READ_CAPABILITY_TOKEN_PREFIX +
    Buffer.from(`${startLine}:${endLine}:${hash}`).toString('base64url')
  )
}

function decodeReadCapabilityToken(
  token: string,
): ReplacementReadCapability | string {
  if (!token.startsWith(READ_CAPABILITY_TOKEN_PREFIX)) {
    return `Invalid basedOnRead: expected a read capability token ("${READ_CAPABILITY_TOKEN_PREFIX}..." from a read_files header) or a { startLine, endLine, hash } object, but received ${JSON.stringify(token)}.`
  }
  let decoded: string
  try {
    decoded = Buffer.from(
      token.slice(READ_CAPABILITY_TOKEN_PREFIX.length),
      'base64url',
    ).toString('utf8')
  } catch {
    return `Invalid basedOnRead capability token: could not decode ${JSON.stringify(token)}. Re-read the target range with read_files and copy the readCapability from the fresh header.`
  }
  const firstSep = decoded.indexOf(':')
  const secondSep = decoded.indexOf(':', firstSep + 1)
  if (firstSep === -1 || secondSep === -1) {
    return `Invalid basedOnRead capability token: malformed payload. Re-read the target range with read_files and copy the readCapability from the fresh header.`
  }
  const startLine = Number(decoded.slice(0, firstSep))
  const endLine = Number(decoded.slice(firstSep + 1, secondSep))
  const hash = decoded.slice(secondSep + 1)
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || !hash) {
    return `Invalid basedOnRead capability token: malformed payload. Re-read the target range with read_files and copy the readCapability from the fresh header.`
  }
  return { startLine, endLine, hash }
}

/**
 * Normalizes a supplied basedOnRead into a concrete capability object. Accepts
 * either the opaque token string minted by read_files or the explicit
 * { startLine, endLine, hash } object (backward compatible). Returns a string
 * when the token is malformed so callers can surface a recoverable error.
 */
function normalizeBasedOnRead(
  basedOnRead: ReplacementReadCapability | string | undefined,
): ReplacementReadCapability | string | undefined {
  if (basedOnRead === undefined) return undefined
  if (typeof basedOnRead === 'string') return decodeReadCapabilityToken(basedOnRead)
  return basedOnRead
}

const LARGE_FILE_LINE_THRESHOLD = 1_000
const LARGE_FILE_CHAR_THRESHOLD = 100_000

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
    basedOnRead?: ReplacementReadCapability | string
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
  const initialContentLineCount = normalizeLineEndings({
    str: initialContent,
  }).split('\n').length
  const isLargeFile =
    initialContent.length > LARGE_FILE_CHAR_THRESHOLD ||
    initialContentLineCount > LARGE_FILE_LINE_THRESHOLD
  // basedOnRead is a large-file safety anchor only. Small files are edited by
  // exact oldString matching, which is already safe, so any basedOnRead supplied
  // on a small file is ignored rather than validated. This prevents repeated
  // edit failures when a stale/mismatched basedOnRead is accidentally included
  // on a file that does not require it (the historical small-file failure loop).
  const enforceReadCapability = isLargeFile
  const normalizedInitialContent = normalizeLineEndings({ str: initialContent })
  const validatedReadRanges = new Map<string, ValidatedReadRange>()
  const preflightErrors: string[] = []
  let ignoredBasedOnReadOnSmallFile = false

  // Decode any token-form basedOnRead up front so the rest of the pipeline only
  // ever sees concrete { startLine, endLine, hash } objects (or undefined).
  const normalizedReplacements = replacements.map((replacement) => ({
    ...replacement,
    basedOnRead: normalizeBasedOnRead(replacement.basedOnRead),
  }))

  if (enforceReadCapability) {
    for (const { basedOnRead } of normalizedReplacements) {
      if (!basedOnRead) continue
      if (typeof basedOnRead === 'string') {
        preflightErrors.push(basedOnRead)
        continue
      }
      const key = getReadCapabilityKey(basedOnRead)
      if (validatedReadRanges.has(key)) continue
      const validatedRange = validateReadCapability({
        content: normalizedInitialContent,
        path,
        basedOnRead,
      })
      if (typeof validatedRange === 'string') {
        preflightErrors.push(validatedRange)
      } else if (validatedRange) {
        validatedReadRanges.set(key, validatedRange)
      }

      // The range hash is the safety boundary for large-file edits. Once the
      // read range is fresh, replacements may freely insert/delete lines inside
      // that anchored range; requiring equal line counts made structural edits
      // to large files effectively impossible and caused repeated no-op retries.
    }
  }

  if (preflightErrors.length > 0) {
    return {
      tool: 'str_replace' as const,
      path,
      error: addFailedEditRecoveryGuidance(preflightErrors.join('\n\n')),
    }
  }

  for (const {
    oldString: oldStr,
    newString: newStr,
    allowMultiple,
    basedOnRead,
  } of normalizedReplacements) {
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

    // A valid basedOnRead is the concrete capability object. (Malformed tokens
    // on large files were already rejected in preflight; on small files any
    // basedOnRead is ignored entirely.)
    const validBasedOnRead =
      basedOnRead && typeof basedOnRead === 'object' ? basedOnRead : undefined

    if (isLargeFile && !validBasedOnRead) {
      // Large files are strict: edits MUST be anchored to a freshly-read range.
      // This guarantees deterministic, location-correct edits instead of
      // "applies only if the string happens to be unique".
      messages.push(
        [
          `Large-file edit blocked for ${path}: this file has ${initialContentLineCount.toLocaleString()} lines and ${initialContent.length.toLocaleString()} characters.`,
          'Do not use naked str_replace on large files.',
          'First read the exact target window with read_files.ranges, then retry with basedOnRead set to the readCapability token from that read header (or { startLine, endLine, hash: rangeHash }).',
        ].join('\n'),
      )
      continue
    }

    if (basedOnRead && !enforceReadCapability) {
      ignoredBasedOnReadOnSmallFile = true
    }

    const validatedReadRange =
      enforceReadCapability && validBasedOnRead
        ? getCurrentValidatedReadRange({
            content: normalizedCurrentContent,
            validatedRange: validatedReadRanges.get(
              getReadCapabilityKey(validBasedOnRead),
            ),
          })
        : null

    const matchContent = validatedReadRange?.content ?? normalizedCurrentContent
    const match = tryMatchOldStr({
      initialContent: matchContent,
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
        : validatedReadRange
          ? replaceWithinValidatedRange({
              content: normalizedCurrentContent,
              range: validatedReadRange,
              oldStr: updatedOldStr,
              newStr: normalizedNewStr,
            })
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

  if (isLargeFile) {
    const newLineCount = normalizeLineEndings({ str: currentContent }).split(
      '\n',
    ).length
    messages.push(
      [
        `Note: ${path} changed (now ${newLineCount.toLocaleString()} lines).`,
        'Any basedOnRead rangeHash you read BEFORE this edit is now stale.',
        'To make several edits to this file, batch them into ONE str_replace call with multiple replacements (each with its own basedOnRead); they are all validated against the pre-edit file, so they will not invalidate each other.',
        'Otherwise, re-read with read_files.ranges to get a fresh rangeHash before the next edit.',
      ].join('\n'),
    )
  }

  if (ignoredBasedOnReadOnSmallFile) {
    messages.push(
      [
        `Note: basedOnRead was ignored for ${path} because this file is below the large-file threshold (${LARGE_FILE_LINE_THRESHOLD.toLocaleString()} lines / ${LARGE_FILE_CHAR_THRESHOLD.toLocaleString()} chars).`,
        'Small files are edited by exact oldString matching; omit basedOnRead for them.',
      ].join('\n'),
    )
  }

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

type ValidatedReadRange = {
  startLine: number
  endLine: number
  content: string
}

function getReadCapabilityKey(basedOnRead: ReplacementReadCapability): string {
  return `${basedOnRead.startLine}:${basedOnRead.endLine}:${basedOnRead.hash}`
}

function getCurrentValidatedReadRange(params: {
  content: string
  validatedRange: ValidatedReadRange | undefined
}): ValidatedReadRange | null {
  const { content, validatedRange } = params
  if (!validatedRange) return null
  const lines = content.split('\n')
  return {
    ...validatedRange,
    content: lines
      .slice(validatedRange.startLine - 1, validatedRange.endLine)
      .join('\n'),
  }
}

function validateReadCapability(params: {
  content: string
  path: string
  basedOnRead: ReplacementReadCapability
}): ValidatedReadRange | string | null {
  const { content, path, basedOnRead } = params
  const { startLine, endLine, hash } = basedOnRead
  if (startLine > endLine) {
    return `Large-file edit blocked for ${path}: basedOnRead.startLine must be <= basedOnRead.endLine.`
  }

  const lines = content.split('\n')
  if (startLine > lines.length) {
    return `Large-file edit blocked for ${path}: basedOnRead starts at line ${startLine}, but the file currently has only ${lines.length} lines. Re-read the target range before editing.`
  }

  const end = Math.min(endLine, lines.length)
  const currentRange = lines.slice(startLine - 1, end).join('\n')
  const currentHash = getContentHash(currentRange)
  if (currentHash !== hash) {
    return [
      `Large-file edit blocked for ${path}: the basedOnRead range is stale.`,
      `Expected ${hash} for lines ${startLine}-${endLine}, but current hash is ${currentHash}.`,
      `Re-read with read_files ranges: [{ path: "${path}", startLine: ${startLine}, endLine: ${endLine} }] and retry with the new rangeHash.`,
      'Tip: when editing the same file multiple times, batch all replacements into a SINGLE str_replace call (each with its own basedOnRead) so earlier edits do not invalidate later ranges.',
    ].join('\n')
  }

  return {
    startLine,
    endLine: end,
    content: currentRange,
  }
}

function replaceWithinValidatedRange(params: {
  content: string
  range: ValidatedReadRange
  oldStr: string
  newStr: string
}): string {
  const { content, range, oldStr, newStr } = params
  const lines = content.split('\n')
  const updatedRange = range.content.replaceAll(oldStr, () => newStr)

  const updatedRangeLines = updatedRange.split('\n')
  return [
    ...lines.slice(0, range.startLine - 1),
    ...updatedRangeLines,
    ...lines.slice(range.endLine),
  ].join('\n')
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
        prev[j] + 1, // Deletion
        prev[j - 1] + cost, // Substitution
      )
    }
    const temp = prev
    prev = curr
    curr = temp
  }

  return prev[len2]
}

function findClosestMatches(params: {
  initialContent: string
  oldStr: string
  limit?: number
}): {
  closestBlock: string
  startLine: number
  endLine: number
  similarity: number
}[] {
  const { initialContent, oldStr, limit = 3 } = params
  if (!oldStr || !initialContent) return []

  const fileLines = initialContent.split('\n')
  const oldLines = oldStr.split('\n')
  const L = oldLines.length

  // 1. Tokenize/Word frequency representation for fast screening
  // Extract alphanumeric words/tokens (length >= 3)
  const oldWords = Array.from(
    new Set(oldStr.toLowerCase().match(/[a-zA-Z0-9_]{3,}/g) || []),
  )

  if (oldWords.length === 0) {
    // Fall back to unique non-whitespace characters if no words
    const uniqueChars = Array.from(new Set(oldStr.replace(/\s+/g, '').toLowerCase()))
    for (const char of uniqueChars) {
      oldWords.push(char)
    }
  }

  // If we still have nothing, we can't search
  if (oldWords.length === 0) return []

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

    candidates.push({
      startLine: 0,
      endLine: K - 1,
      score: currentWindowScore,
    })

    for (let i = 1; i <= fileLines.length - K; i++) {
      currentWindowScore =
        currentWindowScore - lineScores[i - 1] + lineScores[i + K - 1]
      candidates.push({
        startLine: i,
        endLine: i + K - 1,
        score: currentWindowScore,
      })
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score)

  // Keep top candidates to perform the precise Levenshtein distance on.
  const topCandidates = candidates.slice(0, Math.max(12, limit * 6))
  if (topCandidates.length === 0) return []

  const matches: {
    closestBlock: string
    startLine: number
    endLine: number
    similarity: number
  }[] = []

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

    matches.push({
      closestBlock: candidateText,
      startLine: cand.startLine + 1, // 1-indexed for humans/models
      endLine: cand.endLine + 1,
      similarity,
    })
  }

  return matches
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
}

function formatClosestMatchDiagnostics(
  matches: {
    closestBlock: string
    startLine: number
    endLine: number
    similarity: number
  }[],
): string {
  const usefulMatches = matches.filter((match) => match.similarity >= 0.2)
  if (usefulMatches.length === 0) return ''

  return usefulMatches
    .map(
      (match, index) =>
        [
          `Candidate ${index + 1}: lines ${match.startLine}-${match.endLine} (similarity ${Math.round(match.similarity * 100)}%)`,
          `Recovery read: read_files ranges: [{ path, startLine: ${match.startLine}, endLine: ${match.endLine} }]`,
          '```',
          match.closestBlock,
          '```',
        ].join('\n'),
    )
    .join('\n\n')
}

function getLineNumberAtIndex(content: string, index: number): number {
  let line = 1
  const end = Math.min(index, content.length)
  for (let i = 0; i < end; i++) {
    if (content.charCodeAt(i) === 10) {
      line++
    }
  }
  return line
}

function getOccurrenceLineRanges(params: {
  initialContent: string
  oldStr: string
  limit?: number
}): { startLine: number; endLine: number }[] {
  const { initialContent, oldStr, limit = 8 } = params
  const ranges: { startLine: number; endLine: number }[] = []
  let index = initialContent.indexOf(oldStr)

  while (index !== -1 && ranges.length < limit) {
    const startLine = getLineNumberAtIndex(initialContent, index)
    const endLine = getLineNumberAtIndex(initialContent, index + oldStr.length)
    ranges.push({ startLine, endLine })
    index = initialContent.indexOf(oldStr, index + Math.max(1, oldStr.length))
  }

  return ranges
}

function formatOccurrenceDiagnostics(
  occurrences: { startLine: number; endLine: number }[],
): string {
  if (occurrences.length === 0) return ''

  return (
    '\n\nOccurrence ranges for read_files.ranges recovery:\n' +
    occurrences
      .map(
        (occurrence, index) =>
          `Occurrence ${index + 1}: lines ${occurrence.startLine}-${occurrence.endLine} (read_files ranges: [{ path, startLine: ${occurrence.startLine}, endLine: ${occurrence.endLine} }])`,
      )
      .join('\n')
  )
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
    const occurrences = getOccurrenceLineRanges({ initialContent, oldStr })
    const occurrenceDiagnostics = formatOccurrenceDiagnostics(occurrences)
    return {
      success: false,
      error:
        `Found ${count} occurrences of ${JSON.stringify(oldStr)} in the file. Please try again with a longer (more specified) old string or set allowMultiple to true.` +
        occurrenceDiagnostics,
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

  const closestMatches = findClosestMatches({ initialContent, oldStr })
  let errorMsg = `The old string ${JSON.stringify(oldStr)} was not found in the file, skipping. Please try again with a different old string that matches the file content exactly.`
  const diagnostics = formatClosestMatchDiagnostics(closestMatches)
  if (diagnostics) {
    errorMsg += `\n\nClosest candidate ranges for read_files.ranges recovery:\n${diagnostics}`
  }

  return {
    success: false,
    error: errorMsg,
  }
}
