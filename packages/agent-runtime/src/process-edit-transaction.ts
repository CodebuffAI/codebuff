import { applyPatch, createPatch } from 'diff'
import {
  decodeReadCapabilityToken,
  getContentHash,
  normalizeLineEndings,
  readCapabilityMatchesScope,
} from '@codebuff/common/util/content-hash'

import { processStrReplace } from './process-str-replace'
import { processStructuredEdit } from './process-structured-edit'

import type { ReplacementReadCapability } from './process-str-replace'
import type {
  StructuredEditOperation,
  StructuredTransactionEdit,
} from './process-structured-edit'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ReadCapabilityIssuer } from '@codebuff/common/util/content-hash'

type StrReplaceTransactionEdit = {
  id?: string
  type: 'str_replace'
  path: string
  replacements: {
    oldString: string
    newString: string
    allowMultiple: boolean
    occurrenceIndex?: number
    basedOnRead?: ReplacementReadCapability | string
    skipIfMissing?: boolean
  }[]
}

type TransactionEdit =
  | StrReplaceTransactionEdit
  | StructuredTransactionEdit
  | {
      id?: string
      type: 'replace_range'
      path: string
      startLine: number
      endLine: number
      /**
       * Optional on the runtime-facing inputSchema: undefined when the caller
       * combined a whole-file readCapability with narrower startLine/endLine
       * (the runtime derives the sub-range hash at apply time, after verifying
       * the whole-file capability hash).
       */
      expectedHash?: string
      /**
       * Carried from the transformed replace-range inputSchema when the caller
       * combined a whole-file capability with a strict sub-range request. The
       * runtime preflight verifies this equals the whole-file hash of current
       * content; when present, edit.expectedHash is intentionally undefined.
       */
      wholeFileCapabilityHash?: string
      readCapability?: string
      newContent: string
      /** Internal original-snapshot bounds retained when prior range edits shift this edit. */
      originalRange?: { startLine: number; endLine: number }
    }
  | {
      id?: string
      type: 'rewrite_symbol'
      path: string
      symbol: string
      content: string
      occurrence?: number
    }
  | { id?: string; type: 'patch'; path: string; diff: string }
  | { id?: string; type: 'write_file'; path: string; content: string }

type TransactionFailure = {
  editIndex: number
  id?: string
  path: string
  errorMessage: string
}

type TransactionFileChange = {
  path: string
  content: string
  patch: string
  messages: string[]
}

export async function processEditTransaction(params: {
  edits: TransactionEdit[]
  initialContentByPath: Map<string, string | null>
  logger: Logger
  requireFreshReadCapabilityForPaths?: Set<string>
  readCapabilityIssuer?: ReadCapabilityIssuer
}): Promise<
  | {
      tool: 'edit_transaction'
      files: TransactionFileChange[]
      message: string
    }
  | {
      tool: 'edit_transaction'
      error: string
      failures: TransactionFailure[]
    }
> {
  const {
    edits,
    initialContentByPath,
    logger,
    requireFreshReadCapabilityForPaths = new Set<string>(),
    readCapabilityIssuer,
  } = params
  const workingContentByPath = new Map(initialContentByPath)
  const messagesByPath = new Map<string, string[]>()
  const successfulReplaceRangesByPath = new Map<
    string,
    { startLine: number; endLine: number; lineDelta: number }[]
  >()
  const failures: TransactionFailure[] = []
  for (let editIndex = 0; editIndex < edits.length; editIndex++) {
    const edit = edits[editIndex]
    if (!edit) continue
    const coalescedEdit = coalesceAdjacentStrReplaceEdits(edits, editIndex)
    const effectiveEdit = coalescedEdit?.edit ?? edit
    const nextEditIndex = coalescedEdit?.nextEditIndex ?? editIndex + 1

    if (!workingContentByPath.has(effectiveEdit.path)) {
      failures.push({
        editIndex,
        ...(effectiveEdit.id && { id: effectiveEdit.id }),
        path: effectiveEdit.path,
        errorMessage: `Cannot apply ${effectiveEdit.type} edit to ${effectiveEdit.path}: file was not preloaded for transaction preflight. Re-read the target file, then retry the whole transaction.`,
      })
      break
    }

    const rangeAdjustment = getEffectiveReplaceRangeEdit(
      effectiveEdit,
      successfulReplaceRangesByPath.get(effectiveEdit.path) ?? [],
    )
    if ('error' in rangeAdjustment) {
      failures.push({
        editIndex,
        ...(effectiveEdit.id && { id: effectiveEdit.id }),
        path: effectiveEdit.path,
        errorMessage: rangeAdjustment.error,
      })
      break
    }

    const currentContent = workingContentByPath.get(effectiveEdit.path)
    const result = await processTransactionEdit({
      edit: rangeAdjustment.edit,
      initialContentPromise: Promise.resolve(currentContent ?? null),
      originalContentPromise: Promise.resolve(
        initialContentByPath.get(effectiveEdit.path) ?? null,
      ),
      logger,
      requireFreshReadCapability: requireFreshReadCapabilityForPaths.has(
        effectiveEdit.path,
      ),
      readCapabilityIssuer,
    })

    if ('error' in result) {
      const failedEdit = resolveFailedEdit(
        edits,
        editIndex,
        coalescedEdit,
        result.error,
      )
      failures.push({
        editIndex: failedEdit.editIndex,
        ...(failedEdit.edit.id && { id: failedEdit.edit.id }),
        path: effectiveEdit.path,
        errorMessage: result.error,
      })
      break
    }

    workingContentByPath.set(effectiveEdit.path, result.content)
    if (rangeAdjustment.edit.type === 'replace_range') {
      const originalRange = rangeAdjustment.edit.originalRange ?? {
        startLine: rangeAdjustment.edit.startLine,
        endLine: rangeAdjustment.edit.endLine,
      }
      successfulReplaceRangesByPath.set(effectiveEdit.path, [
        ...(successfulReplaceRangesByPath.get(effectiveEdit.path) ?? []),
        {
          ...originalRange,
          lineDelta:
            normalizeLineEndings(rangeAdjustment.edit.newContent).split('\n')
              .length -
            (originalRange.endLine - originalRange.startLine + 1),
        },
      ])
    }
    messagesByPath.set(effectiveEdit.path, [
      ...(messagesByPath.get(effectiveEdit.path) ?? []),
      ...result.messages,
    ])
    editIndex = nextEditIndex - 1
  }

  if (failures.length > 0) {
    const firstFailure = failures[0]
    return {
      tool: 'edit_transaction',
      error: [
        `edit_transaction aborted during preflight at edit ${firstFailure.editIndex + 1} of ${edits.length}, so NO files were changed.`,
        'The detailed cause is listed once in failures below. Re-read only when that failure explicitly requires it, then retry the whole related transaction from one current snapshot.',
      ].join('\n\n'),
      failures,
    }
  }

  const files: TransactionFileChange[] = []
  for (const [path, initialContent] of initialContentByPath.entries()) {
    const finalContent = workingContentByPath.get(path)
    if (typeof finalContent !== 'string') {
      continue
    }
    const comparisonContent = initialContent ?? ''
    if (comparisonContent === finalContent) continue

    let patch = createPatch(path, comparisonContent, finalContent)
    const lines = patch.split('\n')
    const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
    if (hunkStartIndex !== -1) {
      patch = lines.slice(hunkStartIndex).join('\n')
    }

    files.push({
      path,
      content: finalContent,
      patch,
      messages: messagesByPath.get(path) ?? [],
    })
  }

  if (files.length === 0) {
    return {
      tool: 'edit_transaction',
      error:
        'edit_transaction produced no file changes. Re-read the target files/ranges and retry with replacements that change current content.',
      failures: [],
    }
  }

  return {
    tool: 'edit_transaction',
    files,
    message: `edit_transaction preflight prepared ${files.length} coordinated file change(s).`,
  }
}

function coalesceAdjacentStrReplaceEdits(
  edits: TransactionEdit[],
  startIndex: number,
): {
  edit: StrReplaceTransactionEdit
  nextEditIndex: number
  replacementEditIndexes: number[]
} | null {
  const firstEdit = edits[startIndex]
  if (firstEdit?.type !== 'str_replace') return null

  const replacements = [...firstEdit.replacements]
  const replacementEditIndexes = firstEdit.replacements.map(() => startIndex)
  let nextEditIndex = startIndex + 1
  while (nextEditIndex < edits.length) {
    const nextEdit = edits[nextEditIndex]
    if (nextEdit?.type !== 'str_replace' || nextEdit.path !== firstEdit.path) {
      break
    }
    replacements.push(...nextEdit.replacements)
    replacementEditIndexes.push(
      ...nextEdit.replacements.map(() => nextEditIndex),
    )
    nextEditIndex++
  }

  if (nextEditIndex === startIndex + 1) return null

  return {
    edit: {
      ...firstEdit,
      replacements,
    },
    nextEditIndex,
    replacementEditIndexes,
  }
}

function resolveFailedEdit(
  edits: TransactionEdit[],
  editIndex: number,
  coalescedEdit: ReturnType<typeof coalesceAdjacentStrReplaceEdits>,
  errorMessage: string,
): { editIndex: number; edit: TransactionEdit } {
  const replacementMatch = errorMessage.match(/replacement (\d+)/i)
  const replacementIndex = replacementMatch
    ? Number.parseInt(replacementMatch[1], 10) - 1
    : -1
  const sourceEditIndex =
    replacementIndex >= 0
      ? coalescedEdit?.replacementEditIndexes[replacementIndex]
      : undefined
  const failedEditIndex = sourceEditIndex ?? editIndex
  return {
    editIndex: failedEditIndex,
    edit: edits[failedEditIndex] ?? edits[editIndex],
  }
}

function getEffectiveReplaceRangeEdit(
  edit: TransactionEdit,
  priorRanges: { startLine: number; endLine: number; lineDelta: number }[],
): { edit: TransactionEdit } | { error: string } {
  if (edit.type !== 'replace_range') return { edit }

  let lineShift = 0
  for (const priorRange of priorRanges) {
    if (priorRange.endLine < edit.startLine) {
      lineShift += priorRange.lineDelta
    } else if (priorRange.startLine <= edit.endLine) {
      return {
        error: `replace_range blocked for ${edit.path}: lines ${edit.startLine}-${edit.endLine} overlap a prior replace_range in this transaction and cannot be applied from the original snapshot.`,
      }
    }
  }
  if (lineShift === 0) return { edit }

  return {
    edit: {
      ...edit,
      startLine: edit.startLine + lineShift,
      endLine: edit.endLine + lineShift,
      originalRange: { startLine: edit.startLine, endLine: edit.endLine },
    },
  }
}

async function processTransactionEdit(params: {
  edit: TransactionEdit
  initialContentPromise: Promise<string | null>
  originalContentPromise: Promise<string | null>
  logger: Logger
  requireFreshReadCapability: boolean
  readCapabilityIssuer?: ReadCapabilityIssuer
}): Promise<
  | {
      content: string
      messages: string[]
    }
  | {
      error: string
    }
> {
  const {
    edit,
    initialContentPromise,
    originalContentPromise,
    logger,
    requireFreshReadCapability,
    readCapabilityIssuer,
  } = params
  switch (edit.type) {
    case 'str_replace': {
      const initialContent = await initialContentPromise
      if (typeof initialContent === 'string') {
        return processStrReplace({
          path: edit.path,
          replacements: edit.replacements,
          atomic: true,
          transactionContext: true,
          requireFreshReadCapability,
          readCapabilityScope: readCapabilityIssuer
            ? { ...readCapabilityIssuer, path: edit.path }
            : undefined,
          initialContentPromise: Promise.resolve(initialContent),
          logger,
        })
      }

      return processStrReplace({
        path: edit.path,
        replacements: edit.replacements,
        atomic: true,
        transactionContext: true,
        requireFreshReadCapability,
        readCapabilityScope: readCapabilityIssuer
          ? { ...readCapabilityIssuer, path: edit.path }
          : undefined,
        initialContentPromise: Promise.resolve(initialContent),
        logger,
      })
    }
    case 'structured':
      return processStructuredEdit({
        edit: {
          ...edit,
          operation: edit.operation as StructuredEditOperation,
        },
        initialContentPromise,
        logger,
      })
    case 'replace_range': {
      const initialContent = await initialContentPromise
      if (initialContent === null) {
        return { error: `Cannot replace a range in missing file ${edit.path}.` }
      }
      if (requireFreshReadCapability && !edit.readCapability) {
        return {
          error: `replace_range for ${edit.path} requires the readCapability from a fresh read_files range result. Re-read lines ${edit.startLine}-${edit.endLine} and retry with only that capability plus newContent.`,
        }
      }
      // Compute the normalized current content and whole-file hash up front: the
      // whole-file-capability + sub-range path needs the whole-file hash to
      // verify the model observed the full current file. We hash the full
      // normalized string (NOT the trailing-newline-popped visible slice) and use
      // endLine = split('\n').length, EXACTLY matching how read_files'
      // renderWholeFileItem mints a whole-file readCapability, so a whole-file
      // token minted by a read_files.paths call verifies identically here.
      const normalized = normalizeLineEndings(initialContent)
      const lines = normalized.split('\n')
      // visibleLineCount excludes a trailing-empty line so the requested
      // sub-range bounds check never permits a phantom line beyond the last
      // real line (preserves the original bounds behavior).
      const visibleLineCount =
        normalized.length === 0
          ? 0
          : lines.at(-1) === ''
            ? lines.length - 1
            : lines.length
      // wholeFileEndLine / wholeFileHash use the raw split('\n').length and the
      // full normalized hash — matching read_files' renderWholeFileItem so a
      // whole-file token minted by a read_files.paths call verifies here.
      const wholeFileEndLine = normalized.split('\n').length
      const wholeFileHash = getContentHash(normalized)
      if (edit.readCapability) {
        const decoded = decodeReadCapabilityToken(edit.readCapability)
        if (typeof decoded === 'string') {
          return { error: decoded }
        }
        const scope = readCapabilityIssuer
          ? { ...readCapabilityIssuer, path: edit.path }
          : undefined
        if (scope && !readCapabilityMatchesScope(decoded, scope)) {
          return {
            error: `replace_range blocked for ${edit.path}: the readCapability belongs to a different project, path, or agent run. Re-read lines ${edit.startLine}-${edit.endLine} in this run and copy the new capability.`,
          }
        }
        // Exact-range-match path: normally the capability's bounds equal the
        // requested range. When a prior non-overlapping replace_range expanded
        // or contracted this file, retain the original bounds solely to verify
        // the authenticated original-snapshot capability before applying to its
        // shifted working-content range.
        const capabilityRange = edit.originalRange ?? {
          startLine: edit.startLine,
          endLine: edit.endLine,
        }
        const exactRangeMatch =
          decoded.startLine === capabilityRange.startLine &&
          decoded.endLine === capabilityRange.endLine
        // Whole-file-capability + sub-range path: the decoded capability spans
        // the whole current file (startLine === 1, endLine === visibleLineCount)
        // AND the caller requested a narrower sub-range. edit.expectedHash is
        // intentionally undefined in this form; the whole-file hash attests the
        // model saw the current content, and the requested sub-range is just
        // intent.
        const wholeFileCapabilitySubRange =
          !exactRangeMatch &&
          (edit.wholeFileCapabilityHash !== undefined ||
            (decoded.startLine === 1 && decoded.endLine === wholeFileEndLine))
        if (exactRangeMatch) {
          if (decoded.hash !== edit.expectedHash) {
            return {
              error: `replace_range blocked for ${edit.path}: the normalized target does not match its readCapability. Re-read lines ${edit.startLine}-${edit.endLine} and use only the newly returned capability.`,
            }
          }
          if (edit.originalRange) {
            const originalContent = await originalContentPromise
            const originalRange = normalizeLineEndings(originalContent ?? '')
              .split('\n')
              .slice(
                edit.originalRange.startLine - 1,
                edit.originalRange.endLine,
              )
              .join('\n')
            if (getContentHash(originalRange) !== decoded.hash) {
              return {
                error: `replace_range blocked for ${edit.path}: the readCapability does not match the original transaction snapshot range. Re-read lines ${edit.originalRange.startLine}-${edit.originalRange.endLine} and retry the whole transaction.`,
              }
            }
          }
        } else if (wholeFileCapabilitySubRange) {
          // SECURITY INVARIANT: the request must still include a fresh token
          // minted over the FULL current file content. Verify decoded.hash
          // matches the whole-file hash computed from current content. The
          // capability's decoded.hash is the source of truth, not edit.expectedHash.
          if (decoded.startLine !== 1 || decoded.endLine !== wholeFileEndLine) {
            return {
              error: `replace_range blocked for ${edit.path}: the readCapability is not a whole-file capability (it covers lines ${decoded.startLine}-${decoded.endLine} of ${wholeFileEndLine}) and cannot authorize a separate sub-range. Re-read lines ${edit.startLine}-${edit.endLine} and use only the newly returned capability.`,
            }
          }
          if (decoded.hash !== wholeFileHash) {
            return {
              error: `replace_range rejected for ${edit.path}: the whole-file readCapability is stale (its hash no longer matches the current full-file content). Re-read the file (read_files.paths) and copy the fresh whole-file readCapability, then retry the sub-range replace_range.`,
            }
          }
          // Whole-file capability is fresh. The requested sub-range is accepted
          // WITHOUT an expectedHash match because the model demonstrated it saw
          // the complete current file. Fall through to bounds + apply.
        } else {
          return {
            error: `replace_range blocked for ${edit.path}: the normalized target does not match its readCapability. Re-read lines ${edit.startLine}-${edit.endLine} and use only the newly returned capability.`,
          }
        }
      }
      if (
        edit.startLine < 1 ||
        edit.endLine < edit.startLine ||
        edit.endLine > visibleLineCount
      ) {
        return {
          error: `replace_range ${edit.startLine}-${edit.endLine} is outside ${edit.path} (${visibleLineCount} lines).`,
        }
      }
      const currentRange = lines
        .slice(edit.startLine - 1, edit.endLine)
        .join('\n')
      const currentRangeHash = getContentHash(currentRange)
      // The whole-file-capability + sub-range path skips the expectedHash match
      // (expectedHash is undefined; the whole-file hash already attested
      // freshness above). All other paths require expectedHash to match the
      // current sub-range hash.
      const usingWholeFileCapabilitySubRange =
        edit.readCapability !== undefined && edit.expectedHash === undefined
      if (!usingWholeFileCapabilitySubRange) {
        if (currentRangeHash !== edit.expectedHash) {
          return {
            error: `replace_range rejected for ${edit.path}: expectedHash is stale. Re-read lines ${edit.startLine}-${edit.endLine} and use only the new readCapability plus newContent.`,
          }
        }
      }
      const wholeFileSubRangePrefix = usingWholeFileCapabilitySubRange
        ? ' using a whole-file readCapability'
        : ''
      const replacementLines = normalizeLineEndings(edit.newContent).split('\n')
      lines.splice(
        edit.startLine - 1,
        edit.endLine - edit.startLine + 1,
        ...replacementLines,
      )
      return {
        content: lines.join('\n'),
        messages: [
          `Replaced lines ${edit.startLine}-${edit.endLine} in ${edit.path}${wholeFileSubRangePrefix}.`,
        ],
      }
    }
    case 'rewrite_symbol': {
      const initialContent = await initialContentPromise
      if (initialContent === null) {
        return {
          error: `Cannot rewrite a symbol in missing file ${edit.path}.`,
        }
      }
      const { extractSlices, extendRangeToPrecedingComment } =
        await import('./structural-read')
      const matches = await extractSlices(
        initialContent,
        edit.path,
        [edit.symbol],
        edit.occurrence ?? 5,
      )
      const match = edit.occurrence ? matches[edit.occurrence - 1] : matches[0]
      if (!match || (!edit.occurrence && matches.length > 1)) {
        return {
          error:
            matches.length > 1
              ? `Multiple symbols named ${edit.symbol} exist in ${edit.path}; pass occurrence.`
              : `Symbol ${edit.symbol} was not found in ${edit.path}.`,
        }
      }
      const lines = normalizeLineEndings(initialContent).split('\n')
      const extended = extendRangeToPrecedingComment(lines, match.startLine)
      lines.splice(
        extended.startLine - 1,
        match.endLine - extended.startLine + 1,
        ...normalizeLineEndings(edit.content).split('\n'),
      )
      return {
        content: lines.join('\n'),
        messages: [`Rewrote symbol ${edit.symbol} in ${edit.path}.`],
      }
    }
    case 'patch': {
      const initialContent = await initialContentPromise
      if (initialContent === null) {
        return { error: `Cannot apply a patch to missing file ${edit.path}.` }
      }
      const content = applyPatch(initialContent, edit.diff)
      return content === false
        ? { error: `Patch did not apply cleanly to ${edit.path}.` }
        : { content, messages: [`Applied patch to ${edit.path}.`] }
    }
    case 'write_file':
      return {
        content: edit.content,
        messages: [`Prepared whole-file content for ${edit.path}.`],
      }
    default: {
      const _exhaustive: never = edit
      return {
        error: `Unsupported transaction edit type: ${JSON.stringify(_exhaustive)}`,
      }
    }
  }
}
