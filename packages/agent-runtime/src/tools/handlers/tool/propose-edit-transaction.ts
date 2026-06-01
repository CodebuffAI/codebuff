import { processEditTransaction } from '../../../process-edit-transaction'
import { appendProposalArtifact } from './proposal-ledger-store'
import {
  getProposedContent,
  setProposedContent,
} from './proposed-content-store'

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
  const { edits } = toolCall.input

  await previousToolCallFinished

  const getProposedOrDiskContent = async (
    path: string,
  ): Promise<string | null> => {
    const proposedContent = getProposedContent(runId, path)
    if (proposedContent !== undefined) {
      return proposedContent
    }
    return requestOptionalFile({ ...params, filePath: path })
  }

  const uniquePaths = Array.from(new Set(edits.map((edit) => edit.path)))
  const initialContentByPath = new Map<string, string | null>()
  for (const path of uniquePaths) {
    initialContentByPath.set(path, await getProposedOrDiskContent(path))
  }

  const transactionResult = await processEditTransaction({
    edits,
    initialContentByPath,
    logger,
  }).catch((error: unknown) => {
    logger.error(error, 'Error processing propose_edit_transaction')
    return {
      tool: 'edit_transaction' as const,
      error: 'Unknown error: Failed to process the propose_edit_transaction.',
      failures: [],
    }
  })

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

  // Stack proposed content so subsequent propose calls on these files build on
  // this transaction's results.
  for (const file of transactionResult.files) {
    setProposedContent(runId, file.path, Promise.resolve(file.content))
  }

  // Record one ledger artifact per changed file. The whole transaction input is
  // stored on each so the parent can reconstruct and apply the bundle.
  for (const file of transactionResult.files) {
    appendProposalArtifact(runId, {
      toolName: 'propose_edit_transaction',
      input: toolCall.input,
      result: {
        file: file.path,
        ok: true,
        unifiedDiff: file.patch,
        message:
          file.messages.length > 0
            ? file.messages.join('\n\n')
            : `Proposed changes to ${file.path}`,
      },
    })
  }

  return {
    output: [
      {
        type: 'json',
        value: {
          message: transactionResult.message,
          files: transactionResult.files.map((file) => ({
            file: file.path,
            unifiedDiff: file.patch,
            messages: file.messages,
          })),
        },
      },
    ],
  }
}) satisfies CodebuffToolHandlerFunction<'propose_edit_transaction'>
