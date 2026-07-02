import { createPatch, diffLines } from 'diff'

import { tryToDoStringReplacementWithExtraIndentation } from './generate-diffs-prompt'

import {
  getContentHash,
  normalizeLineEndings,
  encodeReadCapabilityToken,
  decodeReadCapabilityToken,
  READ_CAPABILITY_TOKEN_PREFIX,
  type ReplacementReadCapability,
} from '@codebuff/common/util/content-hash'

import type { Logger } from '@codebuff/common/types/contracts/logger'

// Re-export so existing importers (structural-read, propose-* handlers, tests)
// keep working from a single source of truth.
export {
  getContentHash,
  encodeReadCapabilityToken,
  decodeReadCapabilityToken,
  READ_CAPABILITY_TOKEN_PREFIX,
  type ReplacementReadCapability,
} from '@codebuff/common/util/content-hash'

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

// Obvious placeholder/stub anchors that should never be accepted, even on small
// files where basedOnRead is otherwise ignored. Silently ignoring these let bad
// tool-call hygiene (e.g. an editor emitting basedOnRead: "dummy") look fine on
// small files, then fail confusingly on the first large file. We reject them up
// front everywhere so the mistake surfaces immediately and consistently.
const BOGUS_READ_CAPABILITY_VALUES = new Set([
  'dummy',
  'todo',
  'tbd',
  'fixme',
  'placeholder',
  'none',
  'null',
  'undefined',
  'cap.dummy',
  'cap.todo',
  'cap.placeholder',
])

/**
 * Returns a recoverable error string when a string-form basedOnRead is clearly
 * not a real read capability token (a stub/placeholder or anything that does not
 * decode), otherwise null. Applied regardless of file size so bogus anchors are
 * never silently ignored.
 */
function describeBogusReadCapability(
  basedOnRead: ReplacementReadCapability | string | undefined,
  decoded: ReplacementReadCapability | string | undefined,
): string | null {
  if (typeof basedOnRead !== 'string') return null
  if (BOGUS_READ_CAPABILITY_VALUES.has(basedOnRead.trim().toLowerCase())) {
    return `Invalid basedOnRead: ${JSON.stringify(basedOnRead)} is a placeholder, not a real read capability. Never pass a stub anchor. For small files omit basedOnRead entirely; for large files read the exact range with read_files and copy the readCapability token from the fresh header.`
  }
  // A string that fails to decode into a concrete { startLine, endLine, hash }
  // is malformed; surface decodeReadCapabilityToken's targeted message.
  if (typeof decoded === 'string') return decoded
  return null
}

const LARGE_FILE_LINE_THRESHOLD = 1_000
const LARGE_FILE_CHAR_THRESHOLD = 100_000
// Skip minting a single union regionAnchor when the edited hunks span more than
// this many lines: the slice (and its hash) would be huge and low-value. The
// per-hunk anchors still cover each edit site in that case.
const REGION_ANCHOR_MAX_SPAN = 400

const FAILED_EDIT_RECOVERY_GUIDANCE = [
  'Recovery required: stop retrying this edit from memory.',
  'This usually means the target text was already changed/removed, or your oldString came from a stale read.',
  'Before attempting another str_replace on this file, re-read the exact current lines with read_files and copy the current text into oldString.',
  'If your intent is to replace/delete a whole current line range, consider replace_range with expectedHash from read_files.ranges instead of reconstructing a large oldString.',
  'Base the next edit on the fresh read, not on the failed oldString.',
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
    occurrenceIndex?: number
    basedOnRead?: ReplacementReadCapability | string
    skipIfMissing?: boolean
  }[]
  /**
   * When true, any failed replacement aborts the entire batch without applying
   * partial edits. Large files are always atomic regardless of this flag.
   */
  atomic?: boolean
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
  const { path, replacements, atomic = false, initialContentPromise, logger } = params
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
  // Atomic edits are all-or-nothing: if any replacement in the batch fails to
  // match, NONE are applied. Large files are always atomic to prevent confusing
  // partial-apply state that shifts line numbers and invalidates read anchors;
  // small files can opt in with atomic: true for logically grouped edits.
  const failures: string[] = []
  const defaultLineEnding = getDominantLineEnding(currentContent)
  const initialContentLineCount = normalizeLineEndings(initialContent).split('\n').length
  const isLargeFile =
    initialContent.length > LARGE_FILE_CHAR_THRESHOLD ||
    initialContentLineCount > LARGE_FILE_LINE_THRESHOLD
  const useAtomicBatch = isLargeFile || atomic
  // basedOnRead is a large-file safety anchor only. Small files are edited by
  // exact oldString matching, which is already safe, so valid basedOnRead
  // anchors supplied on a small file are ignored after basic runtime shape
  // validation. This prevents repeated edit failures when a stale/mismatched
  // basedOnRead is accidentally included on a file that does not require it (the
  // historical small-file failure loop).
  const enforceReadCapability = isLargeFile
  const normalizedInitialContent = normalizeLineEndings(initialContent)
  const validatedReadRanges = new Map<string, ValidatedReadRange>()
  const readCapabilityWarnings: string[] = []
  const preflightErrors: string[] = []
  let ignoredBasedOnReadOnSmallFile = false
  let hadNoOpSkip = false

  // Decode any token-form basedOnRead up front so the rest of the pipeline only
  // ever sees concrete { startLine, endLine, hash } objects (or undefined).
  const normalizedReplacements = replacements.map((replacement) => ({
    ...replacement,
    basedOnRead: normalizeBasedOnRead(replacement.basedOnRead),
  }))

  for (let i = 0; i < normalizedReplacements.length; i++) {
    const basedOnRead = normalizedReplacements[i].basedOnRead
    if (basedOnRead && typeof basedOnRead === 'object') {
      const validationError = validateReadCapabilityObject(basedOnRead)
      if (validationError) {
        preflightErrors.push(`Invalid basedOnRead for replacement ${i + 1}: ${validationError}`)
      }
    }

    const { occurrenceIndex } = normalizedReplacements[i]
    if (
      occurrenceIndex !== undefined &&
      (!Number.isFinite(occurrenceIndex) ||
        !Number.isInteger(occurrenceIndex) ||
        occurrenceIndex < 1)
    ) {
      preflightErrors.push(
        `Invalid occurrenceIndex for replacement ${i + 1}: expected a positive finite integer, but received ${JSON.stringify(occurrenceIndex)}.`,
      )
    }
  }

  // Reject obviously-bogus string anchors (stubs like "dummy", or anything that
  // does not decode) on EVERY file, large or small. This is the only basedOnRead
  // check that runs on small files; valid "cap...." tokens decode to objects and
  // are unaffected, and object-form anchors stay ignored on small files.
  //
  // Loop-breaker: when the supplied anchor is bogus but the replacement's
  // oldString still uniquely identifies a spot in the current file, the anchor
  // is unnecessary. Auto-strip it and apply as a naked edit instead of
  // hard-failing. This prevents the failure loop where a model re-reads, then
  // resubmits the SAME bogus anchor (e.g. basedOnRead: "/placeholder") after
  // every recovery instruction, burning attempts without ever progressing.
  let autoStrippedBogusAnchor = false
  for (let i = 0; i < replacements.length; i++) {
    const bogus = describeBogusReadCapability(
      replacements[i].basedOnRead,
      normalizedReplacements[i].basedOnRead,
    )
    if (!bogus) continue

    const normalizedOldStr = normalizeLineEndings(replacements[i].oldString ?? '')
    const uniquelyMatchable =
      normalizedOldStr.length > 0 &&
      normalizedInitialContent.split(normalizedOldStr).length - 1 === 1

    if (uniquelyMatchable) {
      normalizedReplacements[i].basedOnRead = undefined
      autoStrippedBogusAnchor = true
      continue
    }

    preflightErrors.push(
      [
        bogus,
        'The bogus anchor could NOT be auto-stripped because this oldString is not uniquely matchable in the current file.',
        'Do NOT resubmit the same basedOnRead literal. Either omit basedOnRead entirely and pass a longer, unique oldString, or read the exact target range with read_files and copy the readCapability token from the fresh header.',
      ].join('\n'),
    )
  }

  if (preflightErrors.length > 0) {
    return {
      tool: 'str_replace' as const,
      path,
      error: addFailedEditRecoveryGuidance(preflightErrors.join('\n\n')),
    }
  }

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
        readCapabilityWarnings.push(validatedRange)
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
    occurrenceIndex,
    basedOnRead,
    skipIfMissing,
  } of normalizedReplacements) {
    const normalizedCurrentContent = normalizeLineEndings(currentContent)
    const normalizedOldStr = normalizeLineEndings(oldStr)
    const normalizedNewStr = normalizeLineEndings(newStr)

    // Regular case: require oldStr for replacements
    if (!oldStr) {
      const emptyOldStrMessage =
        'The old string was empty, which does not match any content, skipping.'
      messages.push(emptyOldStrMessage)
      failures.push(emptyOldStrMessage)
      continue
    }

    // occurrenceIndex: the caller asserts EXACTLY which repeated occurrence to
    // edit (1-indexed). This is a fully-specified target, so it bypasses the
    // ambiguity gate AND the near-match auto-correction in tryMatchOldStr: it
    // requires an exact literal match and fails cleanly if fewer than N exist.
    // It is its own complete path — no basedOnRead anchor is required even on
    // large files, because the index itself disambiguates. When a fresh
    // basedOnRead range is also present, we count occurrences WITHIN that range
    // slice so the anchor scopes the region and the index picks within it.
    if (occurrenceIndex !== undefined) {
      const freshValidatedRangeForIndex =
        basedOnRead && typeof basedOnRead === 'object'
          ? validatedReadRanges.get(getReadCapabilityKey(basedOnRead))
          : undefined
      const validatedRangeForIndex =
        enforceReadCapability && freshValidatedRangeForIndex
          ? getCurrentValidatedReadRange({
              content: normalizedCurrentContent,
              validatedRange: freshValidatedRangeForIndex,
            })
          : null
      const searchContent =
        validatedRangeForIndex?.content ?? normalizedCurrentContent
      if (
        skipIfMissing === true &&
        normalizedNewStr === '' &&
        !searchContent.includes(normalizedOldStr)
      ) {
        messages.push(
          `Skipped already-applied str_replace deletion in ${path}: oldString was not present${validatedRangeForIndex ? ' within the anchored range' : ''}.`,
        )
        hadNoOpSkip = true
        continue
      }
      const at = getNthOccurrenceIndex(
        searchContent,
        normalizedOldStr,
        occurrenceIndex,
      )
      if (at === -1) {
        const totalOccurrences =
          searchContent.split(normalizedOldStr).length - 1
        const occurrenceFailure = [
          `Could not apply occurrenceIndex ${occurrenceIndex} for ${path}: only ${totalOccurrences} exact occurrence(s) of the oldString exist${validatedRangeForIndex ? ' within the anchored range' : ''}.`,
          'Re-read the file/range to confirm how many occurrences exist, then pass a valid 1-indexed occurrenceIndex.',
        ].join('\n')
        messages.push(occurrenceFailure)
        failures.push(occurrenceFailure)
        continue
      }
      const updatedSearchContent =
        searchContent.slice(0, at) +
        normalizedNewStr +
        searchContent.slice(at + normalizedOldStr.length)
      if (validatedRangeForIndex) {
        const absoluteStartOffset = getOffsetForLine({
          content: normalizedCurrentContent,
          line: validatedRangeForIndex.startLine,
        })
        const absoluteEditStart = absoluteStartOffset + at
        const absoluteEditEnd = absoluteEditStart + normalizedOldStr.length
        const editedRange = getLineRangeForOffsets({
          content: normalizedCurrentContent,
          startOffset: absoluteEditStart,
          endOffset: absoluteEditEnd,
        })
        currentContent = [
          ...normalizedCurrentContent.split('\n').slice(0, validatedRangeForIndex.startLine - 1),
          ...updatedSearchContent.split('\n'),
          ...normalizedCurrentContent.split('\n').slice(validatedRangeForIndex.endLine),
        ].join('\n')
        updateValidatedRangesAfterEdit({
          validatedReadRanges,
          content: currentContent,
          editedStartLine: editedRange.startLine,
          editedEndLine: editedRange.endLine,
          lineDelta:
            normalizedNewStr.split('\n').length -
            normalizedOldStr.split('\n').length,
          editedRange: freshValidatedRangeForIndex,
        })
      } else {
        const occurrenceRange = getOccurrenceLineRanges({
          initialContent: normalizedCurrentContent,
          oldStr: normalizedOldStr,
          limit: occurrenceIndex,
        })[occurrenceIndex - 1]
        currentContent = updatedSearchContent
        if (occurrenceRange) {
          updateValidatedRangesAfterEdit({
            validatedReadRanges,
            content: currentContent,
            editedStartLine: occurrenceRange.startLine,
            editedEndLine: occurrenceRange.endLine,
            lineDelta:
              normalizedNewStr.split('\n').length -
              normalizedOldStr.split('\n').length,
          })
        }
      }
      continue
    }

    // A fresh basedOnRead is a concrete capability object whose range hash still
    // matched the current file during preflight. Stale or never-validated object
    // anchors are treated exactly like a MISSING anchor here: large-file edits
    // fall back to deterministic oldString matching rather than hard-failing, so
    // an otherwise-safe unique edit is never blocked by stale range metadata.
    // (Malformed/placeholder string anchors are still rejected in preflight.)
    const freshValidatedRange =
      basedOnRead && typeof basedOnRead === 'object'
        ? validatedReadRanges.get(getReadCapabilityKey(basedOnRead))
        : undefined
    const hasFreshBasedOnRead = Boolean(freshValidatedRange)
    const hasStaleBasedOnRead =
      Boolean(basedOnRead && typeof basedOnRead === 'object') &&
      !hasFreshBasedOnRead

    if (isLargeFile && !hasFreshBasedOnRead) {
      const fallback = getDeterministicLargeFileFallbackRange({
        content: normalizedCurrentContent,
        oldStr: normalizedOldStr,
        allowMultiple,
      })

      if (fallback) {
        messages.push(
          [
            hasStaleBasedOnRead
              ? `Note: applied large-file edit by deterministic oldString match at lines ${fallback.startLine}-${fallback.endLine}, ignoring a stale basedOnRead anchor because oldString was uniquely identifiable.`
              : `Note: applied large-file edit by deterministic oldString match at lines ${fallback.startLine}-${fallback.endLine}; no basedOnRead anchor was needed because oldString was uniquely identifiable.`,
            'This fallback is only allowed when oldString is uniquely identifiable, or when allowMultiple is true and replacing every exact occurrence is explicitly intended; ambiguous single-target large-file edits still require read_files.ranges or occurrenceIndex.',
            hasStaleBasedOnRead && readCapabilityWarnings.length > 0
              ? `Stale basedOnRead detail:\n${readCapabilityWarnings.join('\n')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        )
      } else {
        const largeFileBlockedMessage = [
          `Large-file edit blocked for ${path}: this file has ${initialContentLineCount.toLocaleString()} lines and ${initialContent.length.toLocaleString()} characters.`,
          hasStaleBasedOnRead
            ? 'The supplied basedOnRead anchor was stale AND oldString was not uniquely identifiable, so the deterministic fallback could not pick a single safe target.'
            : 'No basedOnRead anchor was supplied and oldString was not uniquely identifiable, so the deterministic fallback could not pick a single safe target.',
          'First read the exact target window with read_files.ranges, then retry with a more specific oldString (or basedOnRead set to the readCapability token from that fresh read header).',
          readCapabilityWarnings.length > 0
            ? `basedOnRead detail:\n${readCapabilityWarnings.join('\n')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
        messages.push(largeFileBlockedMessage)
        failures.push(largeFileBlockedMessage)
        continue
      }
    }

    if (basedOnRead && !enforceReadCapability) {
      ignoredBasedOnReadOnSmallFile = true
    }

    const validatedReadRange =
      enforceReadCapability && freshValidatedRange
        ? getCurrentValidatedReadRange({
            content: normalizedCurrentContent,
            validatedRange: freshValidatedRange,
          })
        : null

    const matchContent = validatedReadRange?.content ?? normalizedCurrentContent
    if (
      skipIfMissing === true &&
      normalizedNewStr === '' &&
      !matchContent.includes(normalizedOldStr)
    ) {
      messages.push(
        `Skipped already-applied str_replace deletion in ${path}: oldString was not present${validatedReadRange ? ' within the anchored range' : ''}.`,
      )
      hadNoOpSkip = true
      continue
    }
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
      if (match.message) {
        messages.push(match.message)
      }
    } else {
      messages.push(match.error)
      failures.push(match.error)
      updatedOldStr = null
    }

    if (updatedOldStr === null) {
      currentContent = normalizedCurrentContent
    } else if (validatedReadRange) {
      const replacementResult = replaceWithinValidatedRange({
        content: normalizedCurrentContent,
        range: validatedReadRange,
        oldStr: updatedOldStr,
        newStr: normalizedNewStr,
      })
      currentContent = replacementResult.content
      for (const event of replacementResult.editEvents) {
        updateValidatedRangesAfterEdit({
          validatedReadRanges,
          content: currentContent,
          editedStartLine: event.editedStartLine,
          editedEndLine: event.editedEndLine,
          lineDelta: event.lineDelta,
          editedRange: freshValidatedRange,
        })
      }
    } else {
      const occurrenceRanges = getOccurrenceLineRanges({
        initialContent: normalizedCurrentContent,
        oldStr: updatedOldStr,
        limit: Number.MAX_SAFE_INTEGER,
      })
      currentContent = normalizedCurrentContent.replaceAll(
        updatedOldStr,
        () => normalizedNewStr,
      )
      const lineDeltaPerReplacement =
        normalizedNewStr.split('\n').length - updatedOldStr.split('\n').length
      for (let index = 0; index < occurrenceRanges.length; index++) {
        const occurrenceRange = occurrenceRanges[index]
        const shiftFromEarlierOccurrences = lineDeltaPerReplacement * index
        updateValidatedRangesAfterEdit({
          validatedReadRanges,
          content: currentContent,
          editedStartLine:
            occurrenceRange.startLine + shiftFromEarlierOccurrences,
          editedEndLine: occurrenceRange.endLine + shiftFromEarlierOccurrences,
          lineDelta: lineDeltaPerReplacement,
        })
      }
    }
  }

  // Atomic batch guarantee: abort the whole batch if any replacement failed so
  // the file is never left half-edited. Large files always use this path;
  // small files use it only when the caller opts in with atomic: true.
  if (useAtomicBatch && failures.length > 0) {
    return {
      tool: 'str_replace' as const,
      path,
      error: addFailedEditRecoveryGuidance(
        [
          `Atomic str_replace batch aborted for ${path}: ${failures.length} of ${replacements.length} replacement(s) did not apply, so NO changes were made.`,
          isLargeFile
            ? 'Re-read the exact current ranges for the failed replacements, then resend the whole batch in one str_replace call (each replacement with its own basedOnRead).'
            : 'Re-read the exact current file/range for the failed replacements, then retry the batch or omit atomic to allow partial success.',
          ...failures,
        ].join('\n\n'),
      ),
    }
  }

  currentContent = restoreLineEndingsFromOriginal({
    originalContent: initialContent,
    normalizedInitialContent,
    normalizedFinalContent: currentContent,
    defaultLineEnding,
  })

  // If every requested change was an explicit idempotent no-op, report success
  // so edit_transaction can continue applying later independent edits.
  if (initialContent === currentContent && hadNoOpSkip && failures.length === 0) {
    return {
      tool: 'str_replace' as const,
      path,
      content: currentContent,
      patch: '',
      messages,
    }
  }

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

  // Echo fresh post-edit read anchors so the next edit to this region needs no
  // re-read. Computed from the NEW-side hunk ranges of the final patch (the
  // single source of truth for what changed) over the LF-normalized post-edit
  // content, matching how read_files mints tokens.
  const normalizedFinalContent = normalizeLineEndings(currentContent)
  const hunkRanges = parseNewSideHunkRanges(finalPatch)
  const anchors = hunkRanges.map((range) =>
    mintAnchorForRange({ content: normalizedFinalContent, ...range }),
  )
  const unionStart = hunkRanges.length
    ? Math.min(...hunkRanges.map((range) => range.startLine))
    : 0
  const unionEnd = hunkRanges.length
    ? Math.max(...hunkRanges.map((range) => range.endLine))
    : 0
  const regionAnchor =
    hunkRanges.length && unionEnd - unionStart <= REGION_ANCHOR_MAX_SPAN
      ? mintAnchorForRange({
          content: normalizedFinalContent,
          startLine: unionStart,
          endLine: unionEnd,
        })
      : undefined

  if (isLargeFile) {
    const newLineCount = normalizedFinalContent.split('\n').length
    messages.push(
      [
        `Note: ${path} changed (now ${newLineCount.toLocaleString()} lines).`,
        'Any basedOnRead token you read BEFORE this edit is now stale; use the fresh anchor below instead (it stays valid only until your next edit to this file).',
        regionAnchor
          ? `Fresh anchor for the edited region (lines ${regionAnchor.startLine}-${regionAnchor.endLine}) — pass as basedOnRead on your next edit to this region, no re-read needed:\nreadCapability=${regionAnchor.readCapability}`
          : anchors.length > 0
            ? `Edits were scattered; use these per-hunk anchors as basedOnRead for follow-up edits (no re-read needed):\n${anchors
                .map(
                  (anchor) =>
                    `lines ${anchor.startLine}-${anchor.endLine}: readCapability=${anchor.readCapability}`,
                )
                .join('\n')}`
          : 'To make several edits to this file at once, batch them into ONE str_replace call with multiple replacements (each with its own basedOnRead).',
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

  if (autoStrippedBogusAnchor) {
    messages.push(
      [
        `Note: an invalid basedOnRead anchor was ignored for ${path} because the oldString was uniquely matchable, so the edit applied as a naked edit.`,
        'Stop passing placeholder/invalid basedOnRead values. Omit basedOnRead when oldString is unique, or copy the readCapability token from a fresh read_files header.',
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

function validateReadCapabilityObject(
  basedOnRead: ReplacementReadCapability,
): string | null {
  const { startLine, endLine, hash } = basedOnRead
  if (
    !Number.isFinite(startLine) ||
    !Number.isInteger(startLine) ||
    startLine < 1
  ) {
    return `basedOnRead.startLine must be a positive finite integer, but received ${JSON.stringify(startLine)}.`
  }
  if (
    !Number.isFinite(endLine) ||
    !Number.isInteger(endLine) ||
    endLine < 1
  ) {
    return `basedOnRead.endLine must be a positive finite integer, but received ${JSON.stringify(endLine)}.`
  }
  if (typeof hash !== 'string' || hash.length === 0) {
    return 'basedOnRead.hash must be a nonempty string.'
  }
  if (startLine > endLine) {
    return 'basedOnRead.startLine must be <= basedOnRead.endLine.'
  }
  return null
}

function validateReadCapability(params: {
  content: string
  path: string
  basedOnRead: ReplacementReadCapability
}): ValidatedReadRange | string | null {
  const { content, path, basedOnRead } = params
  const { startLine, endLine, hash } = basedOnRead
  const objectValidationError = validateReadCapabilityObject(basedOnRead)
  if (objectValidationError) {
    return `Large-file edit blocked for ${path}: ${objectValidationError}`
  }

  const lines = content.split('\n')
  if (startLine > lines.length) {
    return `Large-file edit blocked for ${path}: basedOnRead starts at line ${startLine}, but the file currently has only ${lines.length} lines. Re-read the target range before editing.`
  }

  const end = Math.min(endLine, lines.length)
  const currentRange = lines.slice(startLine - 1, end).join('\n')
  const currentHash = getContentHash(currentRange)
  if (currentHash !== hash) {
    // Mint a fresh capability token for the CURRENT content of the same line
    // range, so after a re-read confirms oldString the agent can retry
    // immediately without having to re-derive a hash/token by hand.
    const freshToken = encodeReadCapabilityToken({
      startLine,
      endLine: end,
      hash: currentHash,
    })
    return [
      `Large-file edit blocked for ${path}: the basedOnRead range is stale.`,
      `Expected ${hash} for lines ${startLine}-${endLine}, but current hash is ${currentHash}.`,
      `Re-read with read_files ranges: [{ path: "${path}", startLine: ${startLine}, endLine: ${endLine} }] and retry with the new rangeHash.`,
      `Fresh capability token for the CURRENT content of lines ${startLine}-${end} (copy oldString verbatim from a fresh read_files output, then pass this token as basedOnRead on your next edit to this range):\nreadCapability=${freshToken}`,
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
}): {
  content: string
  editEvents: { editedStartLine: number; editedEndLine: number; lineDelta: number }[]
} {
  const { content, range, oldStr, newStr } = params
  const lines = content.split('\n')
  const occurrenceRanges = getOccurrenceLineRanges({
    initialContent: range.content,
    oldStr,
    limit: Number.MAX_SAFE_INTEGER,
  })
  const updatedRange = range.content.replaceAll(oldStr, () => newStr)
  const updatedRangeLines = updatedRange.split('\n')
  const lineDeltaPerReplacement = newStr.split('\n').length - oldStr.split('\n').length
  return {
    content: [
      ...lines.slice(0, range.startLine - 1),
      ...updatedRangeLines,
      ...lines.slice(range.endLine),
    ].join('\n'),
    editEvents: occurrenceRanges.map((occurrenceRange, index) => {
      const shiftFromEarlierOccurrences = lineDeltaPerReplacement * index
      return {
        editedStartLine:
          range.startLine + occurrenceRange.startLine - 1 + shiftFromEarlierOccurrences,
        editedEndLine:
          range.startLine + occurrenceRange.endLine - 1 + shiftFromEarlierOccurrences,
        lineDelta: lineDeltaPerReplacement,
      }
    }),
  }
}

function updateValidatedRangesAfterEdit(params: {
  validatedReadRanges: Map<string, ValidatedReadRange>
  content: string
  editedStartLine: number
  editedEndLine: number
  lineDelta: number
  editedRange?: ValidatedReadRange
}): void {
  const {
    validatedReadRanges,
    content,
    editedStartLine,
    editedEndLine,
    lineDelta,
    editedRange,
  } = params
  const lines = content.split('\n')

  for (const range of validatedReadRanges.values()) {
    if (range.startLine > editedEndLine) {
      range.startLine += lineDelta
      range.endLine += lineDelta
    } else if (range.endLine < editedStartLine) {
      // Earlier range is unchanged.
    } else {
      if (range === editedRange) {
        range.endLine += lineDelta
      } else {
        if (range.startLine > editedStartLine) {
          range.startLine = editedStartLine
        }
        range.endLine += lineDelta
      }
    }

    range.startLine = Math.max(1, range.startLine)
    range.endLine = Math.max(range.startLine, range.endLine)
    range.content = lines.slice(range.startLine - 1, range.endLine).join('\n')
  }
}

function splitWithLineEndings(content: string): string[] {
  return content.match(/.*(?:\r\n|\n|$)/g)?.filter((part) => part.length > 0) ?? []
}

function getOffsetForLine(params: { content: string; line: number }): number {
  const { content, line } = params
  if (line <= 1) return 0
  let offset = 0
  for (let currentLine = 1; currentLine < line; currentLine++) {
    const next = content.indexOf('\n', offset)
    if (next === -1) return content.length
    offset = next + 1
  }
  return offset
}

function getLineRangeForOffsets(params: {
  content: string
  startOffset: number
  endOffset: number
}): { startLine: number; endLine: number } {
  const { content, startOffset, endOffset } = params
  const beforeStart = content.slice(0, Math.max(0, startOffset))
  const beforeEnd = content.slice(0, Math.max(0, Math.max(startOffset, endOffset - 1)))
  return {
    startLine: beforeStart.split('\n').length,
    endLine: beforeEnd.split('\n').length,
  }
}

function getDominantLineEnding(content: string): string {
  const crlfCount = content.match(/\r\n/g)?.length ?? 0
  const lfCount = (content.match(/(?<!\r)\n/g)?.length ?? 0)
  return crlfCount > lfCount ? '\r\n' : '\n'
}

function getLineEnding(line: string): string | null {
  if (line.endsWith('\r\n')) return '\r\n'
  if (line.endsWith('\n')) return '\n'
  return null
}

function restoreLineEndingsFromOriginal(params: {
  originalContent: string
  normalizedInitialContent: string
  normalizedFinalContent: string
  defaultLineEnding: string
}): string {
  const {
    originalContent,
    normalizedInitialContent,
    normalizedFinalContent,
    defaultLineEnding,
  } = params
  if (normalizedInitialContent === normalizedFinalContent) return originalContent

  const originalLines = splitWithLineEndings(originalContent)
  const initialLines = normalizedInitialContent.match(/.*(?:\n|$)/g)?.filter((part) => part.length > 0) ?? []
  const finalLines = normalizedFinalContent.match(/.*(?:\n|$)/g)?.filter((part) => part.length > 0) ?? []
  const changes = diffLines(normalizedInitialContent, normalizedFinalContent)
  let initialLineIndex = 0
  let finalLineIndex = 0
  let removedLineEndings: string[] = []
  const result: string[] = []

  for (const change of changes) {
    const lineCount = change.count ?? splitWithLineEndings(change.value).length
    if (!change.added && !change.removed) {
      removedLineEndings = []
      for (let i = 0; i < lineCount; i++) {
        result.push(originalLines[initialLineIndex] ?? initialLines[initialLineIndex] ?? '')
        initialLineIndex++
        finalLineIndex++
      }
      continue
    }

    if (change.removed) {
      removedLineEndings = []
      for (let i = 0; i < lineCount; i++) {
        removedLineEndings.push(
          getLineEnding(originalLines[initialLineIndex + i] ?? '') ?? defaultLineEnding,
        )
      }
      initialLineIndex += lineCount
      continue
    }

    for (let i = 0; i < lineCount; i++) {
      const finalLine = finalLines[finalLineIndex + i] ?? ''
      result.push(finalLine.replace(/\n$/, removedLineEndings[i] ?? defaultLineEnding))
    }
    removedLineEndings = []
    finalLineIndex += lineCount
  }

  return result.join('')
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

  const sortedMatches = matches.sort((a, b) => b.similarity - a.similarity)
  const selectedMatches: typeof matches = []

  // Prefer showing distinct locations before overlapping windows from the same
  // location. This makes diagnostics more useful for recovery (e.g. utility +
  // test both look plausible) and lets the near-match ambiguity gate compare
  // real alternate locations instead of only adjacent slices of the best block.
  for (const match of sortedMatches) {
    const overlapsSelected = selectedMatches.some(
      (selected) =>
        match.startLine <= selected.endLine && match.endLine >= selected.startLine,
    )
    if (!overlapsSelected) {
      selectedMatches.push(match)
      if (selectedMatches.length >= limit) return selectedMatches
    }
  }

  for (const match of sortedMatches) {
    if (selectedMatches.includes(match)) continue
    selectedMatches.push(match)
    if (selectedMatches.length >= limit) return selectedMatches
  }

  return selectedMatches
}

const MIN_USEFUL_DIAGNOSTIC_SIMILARITY = 0.45

function formatClosestMatchDiagnostics(
  matches: {
    closestBlock: string
    startLine: number
    endLine: number
    similarity: number
  }[],
): string {
  const usefulMatches = matches.filter(
    (match) => match.similarity >= MIN_USEFUL_DIAGNOSTIC_SIMILARITY,
  )

  if (usefulMatches.length === 0) {
    const bestSimilarity = matches[0]?.similarity
    if (bestSimilarity === undefined) return ''

    return [
      `No useful candidate ranges found (best similarity ${Math.round(bestSimilarity * 100)}%).`,
      'Do not use the low-similarity candidates from memory; re-read the current file/range and build a new oldString from that output.',
    ].join('\n')
  }

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

// Parses the NEW-file-side line ranges of each hunk in a unified diff patch
// (the `+newStart,newCount` half of each `@@ -a,b +c,d @@` header). These
// address the post-edit file, so they are the correct basis for minting a
// fresh read anchor the model can reuse on its next edit without re-reading.
function parseNewSideHunkRanges(
  patch: string,
): { startLine: number; endLine: number }[] {
  const ranges: { startLine: number; endLine: number }[] = []
  const headerRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/
  for (const line of patch.split('\n')) {
    const match = headerRe.exec(line)
    if (!match) continue
    const start = Number(match[1])
    const count = match[2] === undefined ? 1 : Number(match[2])
    if (count === 0) {
      // Pure deletion: anchor the boundary line so a follow-up edit still has
      // surrounding context to address.
      const boundary = Math.max(1, start)
      ranges.push({ startLine: boundary, endLine: boundary })
    } else {
      ranges.push({ startLine: start, endLine: start + count - 1 })
    }
  }
  return ranges
}

// Mints a fresh read capability for a line range of the given content, using
// the exact same LF normalization + hashing as read_files so a write-echoed
// anchor validates identically to a read-minted one.
function mintAnchorForRange(params: {
  content: string
  startLine: number
  endLine: number
}): {
  startLine: number
  endLine: number
  readCapability: string
  rangeHash: string
} {
  const lines = normalizeLineEndings(params.content).split('\n')
  const startLine = Math.max(1, params.startLine)
  const endLine = Math.min(lines.length, Math.max(startLine, params.endLine))
  const slice = lines.slice(startLine - 1, endLine).join('\n')
  const rangeHash = getContentHash(slice)
  return {
    startLine,
    endLine,
    rangeHash,
    readCapability: encodeReadCapabilityToken({ startLine, endLine, hash: rangeHash }),
  }
}

// Returns the character index of the Nth (1-indexed) exact occurrence of oldStr
// in content, or -1 if fewer than N occurrences exist. Used by occurrenceIndex
// to target one specific repeated block without a fresh read anchor.
function getNthOccurrenceIndex(
  content: string,
  oldStr: string,
  n: number,
): number {
  if (!oldStr) return -1
  let index = content.indexOf(oldStr)
  let count = 1
  while (index !== -1 && count < n) {
    index = content.indexOf(oldStr, index + Math.max(1, oldStr.length))
    count++
  }
  return count === n ? index : -1
}

function getDeterministicLargeFileFallbackRange(params: {
  content: string
  oldStr: string
  allowMultiple: boolean
}): { startLine: number; endLine: number } | null {
  const { content, oldStr, allowMultiple } = params
  if (!oldStr) return null
  const occurrences = getOccurrenceLineRanges({
    initialContent: content,
    oldStr,
    // Always look for at least two occurrences: for single-target edits this
    // proves uniqueness, and for allowMultiple it proves at least one match.
    limit: 2,
  })
  if (allowMultiple) {
    return occurrences.length > 0
      ? {
          startLine: occurrences[0].startLine,
          endLine: occurrences[occurrences.length - 1].endLine,
        }
      : null
  }
  return occurrences.length === 1 ? occurrences[0] : null
}

// Deterministic near-match constants. These gate when a drifted oldString
// (changed comment, quote style, trailing space, reflowed line, or content
// remembered from a slightly-stale read) may be auto-corrected to the real
// current block. They are intentionally conservative: the goal is to land
// legitimate one-target edits, never to guess on ambiguity.
const NEAR_MATCH_MIN_SIMILARITY = 0.92
// The winner must clearly beat the runner-up: either a similarity margin this
// large, or a runner-up that is itself below NEAR_MATCH_AMBIGUOUS_SECOND.
const NEAR_MATCH_MIN_MARGIN = 0.05
const NEAR_MATCH_AMBIGUOUS_SECOND = 0.85
// Short strings are too easy to match in the wrong place; require substance.
// Fix E: the auto-correct path requires a longer oldString than the diagnostic
// path. A short oldString is the most common way to auto-correct into the wrong
// neighbor, so we gate auto-correction on this higher threshold while still
// emitting candidate-range diagnostics for anything below it.
const NEAR_MATCH_AUTOCORRECT_MIN_OLD_STR_LENGTH = 30
const NEAR_MATCH_MIN_OLD_STR_LENGTH = 10

/**
 * Fix B: cheap, language-agnostic structural sanity check. Apply `newStr` at
 * the single occurrence of `matchedBlock` and verify the replacement does not
 * change the net count of structural brackets ()[]{}. This catches edits that
 * would orphan a brace or split a sibling block even when every
 * similarity/subset/uniqueness gate passed. Intentionally bracket-only: quote
 * and backtick balance is language-dependent and noisy. Returns true when
 * balanced (or when the replacement does not touch any brackets), false when
 * the delta is non-zero.
 */
function isResultDelimiterBalanced(
  matchedBlock: string,
  newStr: string,
): boolean {
  const bracketDelta = (s: string, open: string, close: string): number => {
    let delta = 0
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]
      if (ch === open) delta++
      else if (ch === close) delta--
    }
    return delta
  }
  // Compare the net bracket delta of the old block vs the new block. A whole-file
  // scan would double-count brackets elsewhere and be misleading for deletions.
  const pairs: Array<[string, string]> = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ]
  for (const [open, close] of pairs) {
    const oldDelta = bracketDelta(matchedBlock, open, close)
    const newDelta = bracketDelta(newStr, open, close)
    if (oldDelta !== newDelta) return false
  }
  return true
}

/**
 * After exact and indentation matching fail, decide whether the closest
 * candidate is a safe single-winner auto-correction. Returns the candidate's
 * real current block text (which occurs exactly once in the content) when ALL
 * deterministic gates pass, otherwise null. Never guesses on ambiguity.
 *
 * Gates (all must pass):
 *  - oldString length >= NEAR_MATCH_AUTOCORRECT_MIN_OLD_STR_LENGTH (Fix E)
 *  - best similarity >= NEAR_MATCH_MIN_SIMILARITY (0.92); the earlier 0.80
 *    adaptive branch was removed because it auto-corrected with no margin or
 *    runner-up gate, which corrupted files by editing the wrong block (Fix A).
 *  - unambiguous winner vs any distinct non-overlapping runner-up
 *  - not a strict subset of a wider high-similarity region
 *  - location-unique (occurs exactly once)
 *  - resulting content (after applying newStr at the match) has balanced
 *    brackets ()[]{} — rejects edits that would orphan a brace / split a
 *    block (Fix B, defense-in-depth against the exact transcript corruption).
 */
function tryNearMatchAutoCorrect(params: {
  initialContent: string
  oldStr: string
  newStr: string
}): { oldStr: string; startLine: number; endLine: number; similarity: number } | null {
  const { initialContent, oldStr, newStr } = params
  // Fix E: require a substantive oldString before any auto-correction. The
  // diagnostic path (rich error with candidate ranges) still uses the lower
  // NEAR_MATCH_MIN_OLD_STR_LENGTH, but auto-correcting a very short oldString
  // is the most common way to edit the wrong neighbor.
  if (oldStr.trim().length < NEAR_MATCH_AUTOCORRECT_MIN_OLD_STR_LENGTH) return null

  const matches = findClosestMatches({ initialContent, oldStr, limit: 8 })
  const best = matches[0]
  if (!best) return null

  // findClosestMatches intentionally considers nearby window sizes (L-3..L+3),
  // so the runner-up is often an overlapping slice of the SAME location. That
  // should not make a clearly unique edit look ambiguous. Only a distinct,
  // non-overlapping candidate can block auto-correction.
  const second = matches.find(
    (match) =>
      match.startLine > best.endLine || match.endLine < best.startLine,
  )

  // Fix A: only the strict 0.92 path remains. The earlier 0.80 adaptive
  // branch auto-corrected with no margin check and no unambiguous-winner
  // proof, which was the direct cause of the cascading-corruption transcript
  // (every "auto-corrected a near-match edit (84% similar)" event came from
  // that branch). Below 0.92, fall through to the rich diagnostic error so
  // the model re-reads instead of guessing.
  let isUnambiguous = false
  if (best.similarity >= NEAR_MATCH_MIN_SIMILARITY) {
    if (!second) {
      isUnambiguous = true
    } else {
      const margin = best.similarity - second.similarity
      const ambiguous =
        margin < NEAR_MATCH_MIN_MARGIN &&
        second.similarity >= NEAR_MATCH_AMBIGUOUS_SECOND
      if (!ambiguous) {
        isUnambiguous = true
      }
    }
  }

  if (!isUnambiguous) return null

  // SUBSET SAFETY: a chosen block that appears exactly once in the file is
  // still not safe to auto-correct if it is a strict subset of a larger
  // candidate that also has high similarity. In that case the model almost
  // certainly intended the larger block (its oldString was malformed or
  // remembered from a slightly-stale read), and replacing the subset would
  // orphan the surrounding lines. This is the canonical "edit breaks files
  // for no reason" symptom: a 10-line slice of an 11-line JSDoc'd function
  // passes the occurrences === 1 check but, on apply, leaves the unmatched
  // line floating. Require the chosen block to be the maximal high-similarity
  // region at its location.
  const bestIsStrictSubset = matches.some(
    (match) =>
      match !== best &&
      match.startLine <= best.startLine &&
      match.endLine >= best.endLine &&
      (match.startLine < best.startLine || match.endLine > best.endLine) &&
      match.similarity >= NEAR_MATCH_MIN_SIMILARITY,
  )
  if (bestIsStrictSubset) return null

  // The chosen block must be location-unique so replaceAll edits exactly the
  // intended spot. (It is also necessarily different from oldStr, since an
  // exact single match would have returned earlier.)
  const occurrences = initialContent.split(best.closestBlock).length - 1
  if (occurrences !== 1) return null

  // Fix B: defense-in-depth delimiter-balance check. Apply newStr at the
  // matched block and verify the resulting content does not gain or lose
  // structural brackets. This catches the transcript's failure mode (an
  // auto-correct landing inside the wrong `case` orphaned an `if` body and
  // split a sibling component) even if every other gate passed. Intentionally
  // bracket-only — quote/backtick balance is language-dependent and noisy.
  if (!isResultDelimiterBalanced(best.closestBlock, newStr)) {
    return null
  }

  return {
    oldStr: best.closestBlock,
    startLine: best.startLine,
    endLine: best.endLine,
    similarity: best.similarity,
  }
}

const tryMatchOldStr = (params: {
  initialContent: string
  oldStr: string
  newStr: string
  allowMultiple: boolean
  logger: Logger
}):
  | { success: true; oldStr: string; message?: string }
  | { success: false; error: string } => {
  const { initialContent, oldStr, newStr, allowMultiple, logger } = params
  // count the number of occurrences of oldStr in initialContent
  const count = initialContent.split(oldStr).length - 1
  if (count === 1) {
    return { success: true, oldStr }
  }
  if (!allowMultiple && count > 1) {
    // List ALL candidate ranges (not just the first few) so a forced retry is
    // one-shot: the model can either re-read one exact range, or disambiguate
    // directly by passing occurrenceIndex (1-indexed) without any re-read.
    const occurrences = getOccurrenceLineRanges({
      initialContent,
      oldStr,
      limit: count,
    })
    const occurrenceDiagnostics = formatOccurrenceDiagnostics(occurrences)
    return {
      success: false,
      error:
        `Found ${count} occurrences of ${JSON.stringify(oldStr)} in the file. Please try again with a longer (more specified) old string, set allowMultiple to true to replace all of them, or pass occurrenceIndex (1-indexed) to target exactly one.` +
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
  }

  // Safe deterministic near-match: when exact and indentation matching both
  // fail, auto-correct only a single clear-winner candidate that is
  // location-unique. This lands edits whose oldString drifted slightly (a
  // changed comment, quote style, trailing whitespace, or a stale read) without
  // the old all-whitespace-stripped fallback's risk of silently editing the
  // wrong line (e.g. a utility and its test sharing a similar line). Genuine
  // ambiguity falls through to the rich diagnostics below and fails cleanly.
  const nearMatch = tryNearMatchAutoCorrect({ initialContent, oldStr, newStr })
  if (nearMatch) {
    logger.debug('Matched with near-match auto-correction')
    return {
      success: true,
      oldStr: nearMatch.oldStr,
      message: [
        `⚠ WARNING: auto-corrected a near-match edit (${Math.round(nearMatch.similarity * 100)}% similar) at lines ${nearMatch.startLine}-${nearMatch.endLine}.`,
        `Your oldString did not exactly match the file. The closest unique block at lines ${nearMatch.startLine}-${nearMatch.endLine} was edited as a best-effort recovery, but this is INHERENTLY RISKY — the edit may have landed in the wrong place, or written subtly-wrong content (whitespace, quote style, missing comments).`,
        `Required next step: VERIFY the result. Re-read lines ${nearMatch.startLine}-${nearMatch.endLine} with read_files.ranges to confirm the change is correct. If it is wrong, revert/fix it before continuing.`,
        'To avoid this in future edits: copy oldString verbatim from a fresh read_files output (including exact indentation, quotes, and comments), or pass a basedOnRead capability so the matcher can anchor to the exact range.',
      ].join('\n'),
    }
  }

  const closestMatches = findClosestMatches({ initialContent, oldStr })
  let errorMsg = [
    `The old string ${JSON.stringify(oldStr)} was not found in the file, skipping.`,
    'This often means the target block was already changed/removed, or the oldString came from a stale read.',
    'Please re-read the current file/range and try again with an oldString copied exactly from fresh read_files output.',
  ].join(' ')
  const diagnostics = formatClosestMatchDiagnostics(closestMatches)
  if (diagnostics) {
    errorMsg += `\n\nClosest candidate ranges for read_files.ranges recovery:\n${diagnostics}`
  }

  return {
    success: false,
    error: errorMsg,
  }
}
