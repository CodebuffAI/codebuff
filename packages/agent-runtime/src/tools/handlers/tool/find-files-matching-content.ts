import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleFindFilesMatchingContent = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'find_files_matching_content'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'find_files_matching_content'>,
  ) => Promise<CodebuffToolOutput<'find_files_matching_content'>>
}): Promise<{
  output: CodebuffToolOutput<'find_files_matching_content'>
}> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies CodebuffToolHandlerFunction<'find_files_matching_content'>
