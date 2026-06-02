import { createPatch } from 'diff'

import {
  appendProposalArtifact,
  getOrCaptureOriginalBaseContent,
} from './proposal-ledger-store'
import {
  getProposedContent,
  setProposedContent,
} from './proposed-content-store'
import { getContentHash } from '../../../process-str-replace'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

/**
 * Proposes writing a file without actually applying the changes.
 * Simply overwrites the file exactly with the given content (creating if it doesn't exist).
 * Returns a unified diff of the changes for review.
 */
export const handleProposeWriteFile = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<'propose_write_file'>

    logger: Logger
    runId: string

    requestOptionalFile: RequestOptionalFileFn
  } & ParamsExcluding<RequestOptionalFileFn, 'filePath'>,
): Promise<{ output: CodebuffToolOutput<'propose_write_file'> }> => {
  const {
    previousToolCallFinished,
    toolCall,
    logger: _logger,
    runId,
    requestOptionalFile,
  } = params
  const { path, content } = toolCall.input

  const diskContent = await getOrCaptureOriginalBaseContent(runId, path, () =>
    requestOptionalFile({ ...params, filePath: path }),
  )

  // Get content from proposed state first (by runId), then fall back to disk.
  // Keep the original disk content separately for the final-apply conflict
  // guard; chained same-file proposals may use an intermediate overlay as their
  // immediate edit base, but disk still contains the original content.
  const getProposedOrDiskContent = async (): Promise<string | null> => {
    const proposedContent = getProposedContent(runId, path)
    if (proposedContent !== undefined) {
      return proposedContent
    }
    return diskContent
  }

  const initialContent = await getProposedOrDiskContent()

  // Normalize content (remove leading newline if present)
  const newContent = content.startsWith('\n') ? content.slice(1) : content

  // Store the proposed content for future propose calls on the same file (by runId)
  setProposedContent(runId, path, Promise.resolve(newContent))

  await previousToolCallFinished

  // Generate unified diff
  const oldContent = initialContent ?? ''
  let patch = createPatch(path, oldContent, newContent)
  
  // Strip the header lines, keep only from @@ onwards
  const lines = patch.split('\n')
  const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
  if (hunkStartIndex !== -1) {
    patch = lines.slice(hunkStartIndex).join('\n')
  }

  const isNewFile = initialContent === null
  const message = isNewFile ? `Proposed new file ${path}` : `Proposed changes to ${path}`

  // Record the successful proposal artifact at the source of truth. finalContent
  // is the exact bytes the parent can write deterministically at apply time.
  appendProposalArtifact(runId, {
    toolName: 'propose_write_file',
    input: toolCall.input,
    result: {
      file: path,
      ok: true,
      unifiedDiff: patch,
      message,
      finalContent: newContent,
      baseContentHash: diskContent === null ? null : getContentHash(diskContent),
      baseContent: diskContent,
    },
  })

  return {
    output: [
      {
        type: 'json',
        value: {
          file: path,
          message,
          unifiedDiff: patch,
        },
      },
    ],
  }
}) as CodebuffToolHandlerFunction<'propose_write_file'>
