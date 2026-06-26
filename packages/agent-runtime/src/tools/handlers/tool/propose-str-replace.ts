import { normalizeToolPath } from './write-file'
import {
  appendProposalArtifact,
  getOrCaptureOriginalBaseContent,
} from './proposal-ledger-store'
import {
  getProposedContent,
  setProposedContent,
} from './proposed-content-store'
import {
  getContentHash,
  processStrReplace,
} from '../../../process-str-replace'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { AgentState } from '@codebuff/common/types/session-state'

export const handleProposeStrReplace = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<'propose_str_replace'>

    logger: Logger
    agentState: AgentState
    runId: string

    requestOptionalFile: RequestOptionalFileFn
  } & ParamsExcluding<RequestOptionalFileFn, 'filePath'>,
): Promise<{ output: CodebuffToolOutput<'propose_str_replace'> }> => {
  const {
    previousToolCallFinished,
    toolCall,

    logger,
    runId,

    requestOptionalFile,
  } = params
  const { replacements } = toolCall.input
  const path = normalizeToolPath(toolCall.input.path)
  if (!path) {
    return {
      output: [
        {
          type: 'json',
          value: {
            file: toolCall.input.path,
            errorMessage: `propose_str_replace path traversal blocked: "${toolCall.input.path}" resolves outside the project root.`,
          },
        },
      ],
    }
  }

  const diskContentPromise = getOrCaptureOriginalBaseContent(runId, path, () =>
    requestOptionalFile({ ...params, filePath: path }),
  )

  // Get content from proposed state first (by runId), then fall back to disk.
  // The proposal may be chained on top of earlier same-file proposal edits, but
  // the final apply guard must compare against the ORIGINAL real workspace base,
  // not the intermediate overlay state.
  const getProposedOrDiskContent = async (): Promise<string | null> => {
    const proposedContent = getProposedContent(runId, path)
    if (proposedContent !== undefined) {
      return proposedContent
    }
    return diskContentPromise
  }

  const latestContentPromise = getProposedOrDiskContent()
  const baseContentPromise = diskContentPromise
  const baseContentHashPromise = diskContentPromise.then((content) =>
    content === null ? null : getContentHash(content),
  )

  const strReplaceResultPromise = processStrReplace({
    path,
    replacements,
    initialContentPromise: latestContentPromise,
    logger,
  }).catch((error: any) => {
    logger.error(error, 'Error processing propose_str_replace')
    return {
      tool: 'str_replace' as const,
      path,
      error: 'Unknown error: Failed to process the propose_str_replace.',
    }
  })

  // Store the proposed content for future propose calls on the same file (by runId)
  setProposedContent(
    runId,
    path,
    strReplaceResultPromise.then((result) =>
      'content' in result ? result.content : null,
    ),
  )

  await previousToolCallFinished

  const strReplaceResult = await strReplaceResultPromise

  if ('error' in strReplaceResult) {
    // Record the failed proposal in the deterministic ledger so the parent can
    // see (and repair) it without reconstructing anything from message history.
    appendProposalArtifact(runId, {
      toolName: 'propose_str_replace',
      input: toolCall.input,
      result: {
        file: path,
        ok: false,
        errorMessage: strReplaceResult.error,
      },
    })
    return {
      output: [
        {
          type: 'json',
          value: {
            file: path,
            errorMessage: strReplaceResult.error,
          },
        },
      ],
    }
  }

  const message = strReplaceResult.messages.length > 0
    ? strReplaceResult.messages.join('\n\n')
    : 'Proposed string replacement'

  // Record the successful proposal artifact at the source of truth. finalContent
  // is the resolved overlay content the parent can write deterministically.
  appendProposalArtifact(runId, {
    toolName: 'propose_str_replace',
    input: toolCall.input,
    result: {
      file: path,
      ok: true,
      unifiedDiff: strReplaceResult.patch,
      message,
      finalContent: strReplaceResult.content,
      baseContentHash: await baseContentHashPromise,
      baseContent: await baseContentPromise,
    },
  })

  return {
    output: [
      {
        type: 'json',
        value: {
          file: path,
          message,
          unifiedDiff: strReplaceResult.patch,
        },
      },
    ],
  }
}) satisfies CodebuffToolHandlerFunction<'propose_str_replace'>
