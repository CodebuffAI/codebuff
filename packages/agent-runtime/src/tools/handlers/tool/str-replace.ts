import { postStreamProcessing } from './write-file'
import { processStrReplace } from '../../../process-str-replace'
import { validateToolHandler } from '../handler-function-type'

import type { FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

type ToolName = 'str_replace'
export const handleStrReplace = validateToolHandler<ToolName>(
  async (
    params: {
      previousToolCallFinished: Promise<void>
      toolCall: CodebuffToolCall<ToolName>

      fileProcessingState: FileProcessingState
      logger: Logger

      requestClientToolCall: (
        toolCall: ClientToolCall<ToolName>,
      ) => Promise<CodebuffToolOutput<ToolName>>
      writeToClient: (chunk: string) => void

      requestOptionalFile: RequestOptionalFileFn
    } & ParamsExcluding<RequestOptionalFileFn, 'filePath'>,
  ): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
    const {
      previousToolCallFinished,
      toolCall,

      fileProcessingState,
      logger,

      requestClientToolCall,
      requestOptionalFile,
      writeToClient,
    } = params
    const { path, replacements } = toolCall.input

    if (!fileProcessingState.promisesByPath[path]) {
      fileProcessingState.promisesByPath[path] = []
    }

    const previousPromises = fileProcessingState.promisesByPath[path]
    const previousEdit = previousPromises[previousPromises.length - 1]

    const latestContentPromise = previousEdit
      ? previousEdit.then((maybeResult) =>
          maybeResult && 'content' in maybeResult
            ? maybeResult.content
            : requestOptionalFile({ ...params, filePath: path }),
        )
      : requestOptionalFile({ ...params, filePath: path })

    const newPromise = processStrReplace({
      path,
      replacements,
      initialContentPromise: latestContentPromise,
      logger,
    })
      .catch((error: any) => {
        logger.error(error, 'Error processing str_replace block')
        return {
          tool: 'str_replace' as const,
          path,
          error: 'Unknown error: Failed to process the str_replace block.',
        }
      })
      .then((fileProcessingResult) => ({
        ...fileProcessingResult,
        toolCallId: toolCall.toolCallId,
      }))

    fileProcessingState.promisesByPath[path].push(newPromise)
    fileProcessingState.allPromises.push(newPromise)

    await previousToolCallFinished

    const strReplaceResult = await newPromise
    const clientToolResult = await postStreamProcessing<'str_replace'>(
      strReplaceResult,
      fileProcessingState,
      writeToClient,
      requestClientToolCall,
    )

    const value = clientToolResult[0].value
    if ('messages' in strReplaceResult && 'message' in value) {
      value.message = [...strReplaceResult.messages, value.message].join('\n\n')
    }

    return { output: clientToolResult }
  },
)
