import { processStrReplace } from '../../../process-str-replace'
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
  const { path, replacements } = toolCall.input

  // Get content from proposed state first (by runId), then fall back to disk
  const getProposedOrDiskContent = async (): Promise<string | null> => {
    const proposedContent = getProposedContent(runId, path)
    if (proposedContent !== undefined) {
      return proposedContent
    }
    return requestOptionalFile({ ...params, filePath: path })
  }

  const latestContentPromise = getProposedOrDiskContent()

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
