import { jsonToolResult } from '@codebuff/common/util/messages'

import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { renderReadFilesResult } from '../../../util/render-read-files-result'
import { validateToolHandler } from '../handler-function-type'

import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { ProjectFileContext } from '@codebuff/common/util/file'

type ToolName = 'read_files'
export const handleReadFiles = validateToolHandler<ToolName>(
  async (
    params: {
      previousToolCallFinished: Promise<void>
      toolCall: CodebuffToolCall<ToolName>

      fileContext: ProjectFileContext
    } & ParamsExcluding<typeof getFileReadingUpdates, 'requestedFiles'>,
  ): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
    const {
      previousToolCallFinished,
      toolCall,

      fileContext,
    } = params
    const { paths } = toolCall.input

    await previousToolCallFinished

    const addedFiles = await getFileReadingUpdates({
      ...params,
      requestedFiles: paths,
    })

    return {
      output: jsonToolResult(
        renderReadFilesResult(addedFiles, fileContext.tokenCallers ?? {}),
      ),
    }
  },
)
