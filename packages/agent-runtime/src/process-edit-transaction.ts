import { applyPatch, createPatch } from 'diff'
import {
  getContentHash,
  normalizeLineEndings,
} from '@codebuff/common/util/content-hash'

import { processStrReplace } from './process-str-replace'
import { processStructuredEdit } from './process-structured-edit'

import type { ReplacementReadCapability } from './process-str-replace'
import type {
  StructuredEditOperation,
  StructuredTransactionEdit,
} from './process-structured-edit'
import type { Logger } from '@codebuff/common/types/contracts/logger'

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
      expectedHash: string
      newContent: string
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
  } = params
  const workingContentByPath = new Map(initialContentByPath)
  const messagesByPath = new Map<string, string[]>()
  const failures: TransactionFailure[] = []
  for (const [editIndex, edit] of edits.entries()) {
    if (!workingContentByPath.has(edit.path)) {
      failures.push({
        editIndex,
        ...(edit.id && { id: edit.id }),
        path: edit.path,
        errorMessage: `Cannot apply ${edit.type} edit to ${edit.path}: file was not preloaded for transaction preflight. Re-read the target file, then retry the whole transaction.`,
      })
      break
    }

    const currentContent = workingContentByPath.get(edit.path)
    const result = await processTransactionEdit({
      edit,
      initialContentPromise: Promise.resolve(currentContent ?? null),
      logger,
      requireFreshReadCapability: requireFreshReadCapabilityForPaths.has(
        edit.path,
      ),
    })

    if ('error' in result) {
      failures.push({
        editIndex,
        ...(edit.id && { id: edit.id }),
        path: edit.path,
        errorMessage: result.error,
      })
      break
    }

    workingContentByPath.set(edit.path, result.content)
    messagesByPath.set(edit.path, [
      ...(messagesByPath.get(edit.path) ?? []),
      ...result.messages,
    ])
  }

  if (failures.length > 0) {
    return {
      tool: 'edit_transaction',
      error: [
        `Atomic edit_transaction aborted: ${failures.length} of ${edits.length} edit(s) failed, so NO files were changed.`,
        'Recovery required: re-read the failed file ranges, then retry the whole transaction so related files stay consistent.',
        ...failures.map((failure) =>
          [
            `Edit ${failure.editIndex}${failure.id ? ` (${failure.id})` : ''} failed for ${failure.path}:`,
            failure.errorMessage,
          ].join('\n'),
        ),
      ].join('\n\n'),
      failures,
    }
  }

  const files: TransactionFileChange[] = []
  for (const [path, initialContent] of initialContentByPath.entries()) {
    const finalContent = workingContentByPath.get(path)
    if (
      typeof initialContent !== 'string' ||
      typeof finalContent !== 'string'
    ) {
      continue
    }
    if (initialContent === finalContent) continue

    let patch = createPatch(path, initialContent, finalContent)
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
        'Atomic edit_transaction produced no file changes. Re-read the target files/ranges and retry with replacements that change current content.',
      failures: [],
    }
  }

  return {
    tool: 'edit_transaction',
    files,
    message: `Atomic edit_transaction prepared ${files.length} file change(s).`,
  }
}

async function processTransactionEdit(params: {
  edit: TransactionEdit
  initialContentPromise: Promise<string | null>
  logger: Logger
  requireFreshReadCapability: boolean
}): Promise<
  | {
      content: string
      messages: string[]
    }
  | {
      error: string
    }
> {
  const { edit, initialContentPromise, logger, requireFreshReadCapability } =
    params
  switch (edit.type) {
    case 'str_replace': {
      const initialContent = await initialContentPromise
      if (typeof initialContent === 'string') {
        return processStrReplace({
          path: edit.path,
          replacements: edit.replacements,
          atomic: true,
          requireFreshReadCapability,
          initialContentPromise: Promise.resolve(initialContent),
          logger,
        })
      }

      return processStrReplace({
        path: edit.path,
        replacements: edit.replacements,
        atomic: true,
        requireFreshReadCapability,
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
      const visibleLineCount =
        normalized.length === 0
          ? 0
          : lines.at(-1) === ''
            ? lines.length - 1
            : lines.length
      if (edit.startLine < 1 || edit.endLine > visibleLineCount) {
        return {
          error: `replace_range ${edit.startLine}-${edit.endLine} is outside ${edit.path} (${visibleLineCount} lines).`,
        }
      }
      const currentRange = lines
        .slice(edit.startLine - 1, edit.endLine)
        .join('\n')
      if (getContentHash(currentRange) !== edit.expectedHash) {
        return {
          error: `replace_range rejected for ${edit.path}: expectedHash is stale. Re-read the exact range.`,
        }
      }
      const replacementLines = normalizeLineEndings(edit.newContent).split('\n')
      lines.splice(
        edit.startLine - 1,
        edit.endLine - edit.startLine + 1,
        ...replacementLines,
      )
      return {
        content: lines.join('\n'),
        messages: [
          `Replaced lines ${edit.startLine}-${edit.endLine} in ${edit.path}.`,
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
      const { extractSlices, extendRangeToPrecedingComment } = await import(
        './structural-read'
      )
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
