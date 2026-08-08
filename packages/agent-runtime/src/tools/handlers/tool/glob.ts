import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'

const WINDOWED_GLOB_RESULTS = 100

type ToolName = 'glob'
export const handleGlob = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  agentTemplate: AgentTemplate
  requestClientToolCall: (
    toolCall: ClientToolCall<ToolName>,
  ) => Promise<CodebuffToolOutput<ToolName>>
}): Promise<{
  output: CodebuffToolOutput<ToolName>
}> => {
  const { previousToolCallFinished, toolCall, agentTemplate, requestClientToolCall } =
    params

  await previousToolCallFinished
  const finalToolCall =
    agentTemplate.windowedFileReads === true &&
    toolCall.input.max_results === undefined
      ? {
          ...toolCall,
          input: { ...toolCall.input, max_results: WINDOWED_GLOB_RESULTS },
        }
      : toolCall
  return { output: await requestClientToolCall(finalToolCall) }
}) satisfies CodebuffToolHandlerFunction<ToolName>
