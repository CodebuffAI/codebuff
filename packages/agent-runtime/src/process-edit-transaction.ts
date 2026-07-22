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
    basedOnRead?: string
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
      capabilityStartLine: number
      capabilityEndLine: number
      capabilityHash: string
      readCapability: string
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
      {
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
        // Authenticate original snapshot coordinates. Prior edits may shift the
        // working target, but they do not change the bytes the capability proved.
        if (
          decoded.startLine !== edit.capabilityStartLine ||
          decoded.endLine !== edit.capabilityEndLine ||
          decoded.hash !== edit.capabilityHash
        ) {
          return {
            error: `replace_range blocked for ${edit.path}: normalized capability metadata does not match the authenticated readCapability. Re-read the target and retry with the fresh token.`,
          }
        }
        const originalContent = await originalContentPromise
        const observedContent = normalizeLineEndings(originalContent ?? '')
          .split('\n')
          .slice(edit.capabilityStartLine - 1, edit.capabilityEndLine)
          .join('\n')
        if (getContentHash(observedContent) !== decoded.hash) {
          return {
            error: `replace_range blocked for ${edit.path}: the readCapability-covered content is stale. Re-read lines ${edit.capabilityStartLine}-${edit.capabilityEndLine} and retry with the fresh token.`,
          }
        }
        const authorizationTarget = edit.originalRange ?? {
          startLine: edit.startLine,
          endLine: edit.endLine,
        }
        if (
          authorizationTarget.startLine < edit.capabilityStartLine ||
          authorizationTarget.endLine > edit.capabilityEndLine
        ) {
          return {
            error: `replace_range blocked for ${edit.path}: target lines ${authorizationTarget.startLine}-${authorizationTarget.endLine} are outside the observed capability range ${edit.capabilityStartLine}-${edit.capabilityEndLine}.`,
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
      const authorizationTarget = edit.originalRange ?? {
        startLine: edit.startLine,
        endLine: edit.endLine,
      }
      const narrowedTarget =
        authorizationTarget.startLine !== edit.capabilityStartLine ||
        authorizationTarget.endLine !== edit.capabilityEndLine
      const narrowedTargetSuffix = narrowedTarget
        ? ' within the readCapability-covered range'
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
          `Replaced lines ${edit.startLine}-${edit.endLine} in ${edit.path}${narrowedTargetSuffix}.`,
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
