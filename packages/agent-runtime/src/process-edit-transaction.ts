import { createPatch } from 'diff'

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
    basedOnRead?: ReplacementReadCapability | string
    skipIfMissing?: boolean
  }[]
}

type TransactionEdit = StrReplaceTransactionEdit | StructuredTransactionEdit

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
  const { edits, initialContentByPath, logger } = params
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
      continue
    }

    const currentContent = workingContentByPath.get(edit.path)
    const result = await processTransactionEdit({
      edit,
      initialContentPromise: Promise.resolve(currentContent ?? null),
      logger,
    })

    if ('error' in result) {
      failures.push({
        editIndex,
        ...(edit.id && { id: edit.id }),
        path: edit.path,
        errorMessage: result.error,
      })
      continue
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
    if (typeof initialContent !== 'string' || typeof finalContent !== 'string') {
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
      error: 'Atomic edit_transaction produced no file changes. Re-read the target files/ranges and retry with replacements that change current content.',
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
}): Promise<
  | {
      content: string
      messages: string[]
    }
  | {
      error: string
    }
> {
  const { edit, initialContentPromise, logger } = params
  switch (edit.type) {
    case 'str_replace': {
      const initialContent = await initialContentPromise
      if (typeof initialContent === 'string') {
        const actionableReplacements = edit.replacements.filter(
          (replacement) => !isAlreadyAppliedReplacement(initialContent, replacement),
        )
        const skippedCount = edit.replacements.length - actionableReplacements.length

        if (actionableReplacements.length === 0) {
          return {
            content: initialContent,
            messages: [
              `Skipped ${skippedCount} already-applied str_replace replacement(s) in ${edit.path}.`,
            ],
          }
        }

        return processStrReplace({
          path: edit.path,
          replacements: actionableReplacements,
          atomic: true,
          initialContentPromise: Promise.resolve(initialContent),
          logger,
        })
      }

      return processStrReplace({
        path: edit.path,
        replacements: edit.replacements,
        atomic: true,
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
    default: {
      const _exhaustive: never = edit
      return {
        error: `Unsupported transaction edit type: ${JSON.stringify(_exhaustive)}`,
      }
    }
  }
}

function isAlreadyAppliedReplacement(
  content: string,
  replacement: StrReplaceTransactionEdit['replacements'][number],
): boolean {
  if (replacement.oldString === replacement.newString) return true
  return (
    replacement.skipIfMissing === true &&
    replacement.newString === '' &&
    !content.includes(replacement.oldString)
  )
}
