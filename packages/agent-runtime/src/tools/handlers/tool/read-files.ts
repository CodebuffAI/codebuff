import { jsonToolResult } from '@codebuff/common/util/messages'

import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { renderReadFilesResult } from '../../../util/render-read-files-result'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { ProjectFileContext } from '@codebuff/common/util/file'

type ToolName = 'read_files'
export const handleReadFiles = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>

    fileContext: ProjectFileContext
    fileProcessingState: FileProcessingState
  } & ParamsExcluding<typeof getFileReadingUpdates, 'requestedFiles'>,
): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const {
    previousToolCallFinished,
    toolCall,

    fileContext,
    fileProcessingState,
  } = params
  const paths = toolCall.input.paths.map(normalizeReadFilesPath)
  const ranges = toolCall.input.ranges?.map((range) => ({
    ...range,
    path: normalizeReadFilesPath(range.path),
  }))

  await previousToolCallFinished

  for (const path of new Set([...paths, ...(ranges ?? []).map((range) => range.path)])) {
    delete fileProcessingState.failedEditRequiresReadByPath[path]
    // A fresh read means the next edit should anchor to the same disk content
    // the model just saw, not stale in-memory content from an earlier edit chain.
    delete fileProcessingState.promisesByPath[path]
  }

  const addedFiles = await getFileReadingUpdates({
    ...params,
    requestedFiles: paths,
    ranges,
  })

  return {
    output: jsonToolResult(
      renderReadFilesResult(addedFiles, fileContext.tokenCallers ?? {}),
    ),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>

function normalizeReadFilesPath(path: string): string {
  return path.replace(/^(?:\.\/)+/, '')
}
