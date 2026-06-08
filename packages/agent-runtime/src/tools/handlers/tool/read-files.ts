import { jsonToolResult } from '@codebuff/common/util/messages'

import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { extractSlices, type ExtractedSlice } from '../../../structural-read'
import { renderReadFilesResult } from '../../../util/render-read-files-result'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { ProjectFileContext } from '@codebuff/common/util/file'

type ToolName = 'read_files'
export const handleReadFiles = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>
    requestOptionalFile: RequestOptionalFileFn

    fileContext: ProjectFileContext
    fileProcessingState: FileProcessingState
  } & ParamsExcluding<typeof getFileReadingUpdates, 'requestedFiles'>,
): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const {
    previousToolCallFinished,
    toolCall,
    requestOptionalFile,

    fileContext,
    fileProcessingState,
  } = params
  const paths = toolCall.input.paths.map(normalizeReadFilesPath)
  const ranges = toolCall.input.ranges?.map((range) => ({
    ...range,
    path: normalizeReadFilesPath(range.path),
  }))
  const symbolRequests = toolCall.input.symbols?.map((entry) => ({
    path: normalizeReadFilesPath(entry.path),
    names: entry.names,
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

  const fileResults = renderReadFilesResult(
    addedFiles,
    fileContext.tokenCallers ?? {},
  )

  // Symbol slices: pull just the named symbols' implementations (same
  // extraction the deprecated read_slices alias uses), appended as
  // { path, slices } entries alongside the whole/range file results.
  const sliceResults: Array<{ path: string; slices: ExtractedSlice[] }> = []
  for (const request of symbolRequests ?? []) {
    const rawContent = await requestOptionalFile({
      ...params,
      filePath: request.path,
    })
    const slices =
      rawContent === null
        ? []
        : await extractSlices(rawContent, request.path, request.names)
    sliceResults.push({ path: request.path, slices })
  }

  return {
    output: jsonToolResult([...fileResults, ...sliceResults]),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>

function normalizeReadFilesPath(path: string): string {
  return path.replace(/^(?:\.\/)+/, '')
}
