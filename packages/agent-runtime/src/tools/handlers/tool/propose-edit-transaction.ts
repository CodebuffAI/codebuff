import { processEditTransaction } from '../../../process-edit-transaction'
import { getContentHash } from '../../../process-str-replace'
import { buildProposalResultV1 } from '@codebuff/common/tools/results/filesystem'
import {
  appendProposalArtifact,
  getOrCaptureOriginalBaseContent,
} from './proposal-ledger-store'
import {
  getProposedContent,
  setProposedContent,
} from './proposed-content-store'
import { formatUnsafeToolPathError, normalizeToolPath } from './write-file'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

/**
 * Proposes an atomic multi-file edit transaction without applying the changes.
 * Preflights every edit against in-memory file contents (proposed-content-store
 * first, then disk) and returns a unified diff per affected file for review.
 * Like edit_transaction, if any edit fails preflight no preview diffs are
 * produced. Mirrors propose_str_replace's per-run content stacking and ledger
 * recording so the parent can apply the bundle deterministically later.
 */
export const handleProposeEditTransaction = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<'propose_edit_transaction'>

    logger: Logger
    runId: string

    requestOptionalFile: RequestOptionalFileFn
  } & ParamsExcluding<RequestOptionalFileFn, 'filePath'>,
): Promise<{ output: CodebuffToolOutput<'propose_edit_transaction'> }> => {
  const {
    previousToolCallFinished,
    toolCall,
    logger,
    runId,
    requestOptionalFile,
  } = params
  const edits = toolCall.input.edits.map((edit) => ({
    ...edit,
    path: normalizeToolPath(edit.path),
    ...(edit.type === 'move'
      ? { destinationPath: normalizeToolPath(edit.destinationPath) }
      : {}),
  }))
  const unsafePathIndex = edits.findIndex(
    (edit) => !edit.path || (edit.type === 'move' && !edit.destinationPath),
  )
  if (unsafePathIndex !== -1) {
    const originalEdit = toolCall.input.edits[unsafePathIndex]
    const originalPath =
      originalEdit.type === 'move' && !edits[unsafePathIndex].destinationPath
        ? originalEdit.destinationPath
        : originalEdit.path
    return {
      output: [
        {
          type: 'json',
          value: {
            errorMessage: formatUnsafeToolPathError(
              'propose_edit_transaction',
              originalPath,
            ),
            failures: [
              {
                editIndex: unsafePathIndex,
                path: originalPath,
                errorMessage: formatUnsafeToolPathError(
                  'propose_edit_transaction',
                  originalPath,
                ),
              },
            ],
          },
        },
      ],
    }
  }

  await previousToolCallFinished

  const uniquePaths = Array.from(
    new Set(
      edits.flatMap((edit) =>
        edit.type === 'move' ? [edit.path, edit.destinationPath] : [edit.path],
      ),
    ),
  )
  const initialContentByPath = new Map<string, string | null>()
  const diskContentByPath = new Map<string, string | null>()
  for (const path of uniquePaths) {
    const diskContent = await getOrCaptureOriginalBaseContent(runId, path, () =>
      requestOptionalFile({ ...params, filePath: path }),
    )
    diskContentByPath.set(path, diskContent)
    const proposedContent = await getProposedContent(runId, path)
    initialContentByPath.set(
      path,
      proposedContent !== undefined ? proposedContent : diskContent,
    )
  }

  const contentEdits = edits.filter(
    (edit) =>
      edit.type === 'str_replace' ||
      edit.type === 'structured' ||
      edit.type === 'replace_range' ||
      edit.type === 'rewrite_symbol' ||
      edit.type === 'patch' ||
      edit.type === 'write_file',
  )
  const transactionResult =
    contentEdits.length > 0
      ? await processEditTransaction({
          edits: contentEdits,
          initialContentByPath,
          logger,
        }).catch((error: unknown) => {
          logger.error(error, 'Error processing propose_edit_transaction')
          return {
            tool: 'edit_transaction' as const,
            error:
              'Unknown error: Failed to process the propose_edit_transaction.',
            failures: [],
          }
        })
      : {
          tool: 'edit_transaction' as const,
          message: `Prepared ${edits.length} lifecycle proposal edit(s).`,
          files: [],
        }

  if ('error' in transactionResult) {
    appendProposalArtifact(runId, {
      toolName: 'propose_edit_transaction',
      input: toolCall.input,
      result: {
        file: uniquePaths[0] ?? '',
        ok: false,
        errorMessage: transactionResult.error,
      },
    })
    return {
      output: [
        {
          type: 'json',
          value: {
            errorMessage: transactionResult.error,
            failures: transactionResult.failures,
          },
        },
      ],
    }
  }

  const finalContentByPath = new Map(
    transactionResult.files.map((file) => [file.path, file.content]),
  )
  const overlayUpdates = new Map<string, string | null>(
    transactionResult.files.map((file) => [file.path, file.content]),
  )
  for (const edit of edits) {
    if (edit.type === 'create') {
      if (diskContentByPath.get(edit.path) !== null) {
        return {
          output: [
            {
              type: 'json',
              value: {
                errorMessage: `Cannot propose create for existing file: ${edit.path}`,
                failures: [
                  {
                    editIndex: edits.indexOf(edit),
                    path: edit.path,
                    errorMessage: 'Create destination already exists.',
                  },
                ],
              },
            },
          ],
        }
      }
      finalContentByPath.set(edit.path, edit.content)
      overlayUpdates.set(edit.path, edit.content)
    } else if (edit.type === 'delete') {
      if (diskContentByPath.get(edit.path) == null) {
        return {
          output: [
            {
              type: 'json',
              value: {
                errorMessage: `Cannot propose delete for missing file: ${edit.path}`,
                failures: [
                  {
                    editIndex: edits.indexOf(edit),
                    path: edit.path,
                    errorMessage: 'Delete source does not exist.',
                  },
                ],
              },
            },
          ],
        }
      }
      overlayUpdates.set(edit.path, null)
    } else if (edit.type === 'move') {
      const source = diskContentByPath.get(edit.path)
      if (
        source == null ||
        diskContentByPath.get(edit.destinationPath) !== null
      ) {
        return {
          output: [
            {
              type: 'json',
              value: {
                errorMessage: `Cannot propose move from ${edit.path} to ${edit.destinationPath}.`,
                failures: [
                  {
                    editIndex: edits.indexOf(edit),
                    path: edit.path,
                    errorMessage:
                      source == null
                        ? 'Move source does not exist.'
                        : 'Move destination already exists.',
                  },
                ],
              },
            },
          ],
        }
      }
      overlayUpdates.set(edit.path, null)
      overlayUpdates.set(edit.destinationPath, source)
    }
  }
  for (const [path, content] of overlayUpdates) {
    setProposedContent(runId, path, Promise.resolve(content))
  }

  const createdAt = new Date().toISOString()
  const proposal = buildProposalResultV1({
    proposalId: crypto.randomUUID(),
    baseHash: getContentHash(
      edits
        .flatMap((edit) =>
          edit.type === 'move'
            ? [edit.path, edit.destinationPath]
            : [edit.path],
        )
        .map((path) => {
          const base = diskContentByPath.get(path)
          return `${path}\0${base == null ? 'absent' : getContentHash(base)}`
        })
        .join('\0'),
    ),
    operations: edits.map((edit, index) => {
      const base = diskContentByPath.get(edit.path)
      const preparedFile = transactionResult.files.find(
        (file) => file.path === edit.path,
      )
      const action =
        edit.type === 'delete' || edit.type === 'move'
          ? edit.type
          : base == null
            ? ('create' as const)
            : ('update' as const)
      return {
        actionId: `${toolCall.toolCallId}:${index}`,
        index,
        action,
        path: edit.path,
        ...(edit.type === 'move'
          ? { destinationPath: edit.destinationPath }
          : {}),
        baseHash: base == null ? null : getContentHash(base),
        ...(action === 'create' || action === 'update'
          ? {
              finalContent:
                edit.type === 'create'
                  ? edit.content
                  : finalContentByPath.get(edit.path)!,
            }
          : {}),
        ...(action === 'move' && base != null ? { finalContent: base } : {}),
        ...(preparedFile ? { patch: preparedFile.patch } : {}),
      }
    }),
    createdAt,
  })

  // Record one compatibility artifact per changed file while all artifacts
  // reference the same typed, coordinated proposal.
  // stored on each so the parent can reconstruct and apply the bundle. Each
  // artifact also carries the resolved finalContent + base hash so the parent
  // can apply deterministically (and detect external drift) per file.
  for (const [index, operation] of proposal.operations.entries()) {
    const baseContent = diskContentByPath.get(operation.path)
    appendProposalArtifact(runId, {
      toolName: 'propose_edit_transaction',
      input: toolCall.input,
      result: {
        file: operation.path,
        ok: true,
        ...(operation.patch ? { unifiedDiff: operation.patch } : {}),
        message: `Proposed ${operation.action} for ${operation.path}`,
        ...(operation.finalContent !== undefined
          ? { finalContent: operation.finalContent }
          : {}),
        baseContentHash:
          baseContent === null || baseContent === undefined
            ? null
            : getContentHash(baseContent),
        baseContent: baseContent ?? null,
      },
      ...(index === 0 ? { proposal } : { proposalId: proposal.proposalId }),
    })
  }

  return {
    output: [
      {
        type: 'json',
        value: proposal,
      },
    ],
  }
}) satisfies CodebuffToolHandlerFunction<'propose_edit_transaction'>
