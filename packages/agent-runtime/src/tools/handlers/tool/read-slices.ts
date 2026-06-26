import { jsonToolResult } from '@codebuff/common/util/messages'

import { extractSlices } from '../../../structural-read'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'

type ToolName = 'read_slices'

/**
 * Deprecated alias for read_files with a `symbols` selector. Retained for
 * backward compatibility (e.g. SDK callers); the shipped agents call
 * read_files instead. The slice extraction itself lives in structural-read.
 */
export const handleReadSlices = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  requestOptionalFile: RequestOptionalFileFn
}): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, requestOptionalFile } = params
  const { path, symbols } = toolCall.input

  await previousToolCallFinished

  const rawContent = await requestOptionalFile({ ...params, filePath: path })
  if (rawContent === null) {
    return { output: jsonToolResult({ path, slices: [] }) }
  }

  const slices = await extractSlices(rawContent, path, symbols)
  return { output: jsonToolResult({ path, slices }) }
}) satisfies CodebuffToolHandlerFunction<ToolName>
