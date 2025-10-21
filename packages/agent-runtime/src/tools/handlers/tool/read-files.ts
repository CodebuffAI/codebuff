import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { renderReadFilesResult } from '../../../util/render-read-files-result'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { ProjectFileContext } from '@codebuff/common/util/file'

type ToolName = 'read_files'
export const handleReadFiles = ((
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>

    userInputId: string
    fileContext: ProjectFileContext

    state: {
      userId?: string
      fingerprintId?: string
      repoId?: string
      messages?: Message[]
    }
  } & ParamsExcluding<typeof getFileReadingUpdates, 'requestedFiles'>,
): {
  result: Promise<CodebuffToolOutput<ToolName>>
  state: {}
} => {
  const {
    previousToolCallFinished,
    toolCall,
    userInputId,
    fileContext,
    state,
  } = params
  const { fingerprintId, userId, repoId, messages } = state
  const { paths } = toolCall.input
  if (!messages) {
    throw new Error('Internal error for read_files: Missing messages in state')
  }
  if (!fingerprintId) {
    throw new Error(
      'Internal error for read_files: Missing fingerprintId in state',
    )
  }
  if (!userInputId) {
    throw new Error(
      'Internal error for read_files: Missing userInputId in state',
    )
  }

  const readFilesResultsPromise = (async () => {
    const addedFiles = await getFileReadingUpdates({
      ...params,
      requestedFiles: paths,
    })

    return renderReadFilesResult(addedFiles, fileContext.tokenCallers ?? {})
  })()

  return {
    result: (async () => {
      await previousToolCallFinished
      return [
        {
          type: 'json',
          value: await readFilesResultsPromise,
        },
      ]
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
