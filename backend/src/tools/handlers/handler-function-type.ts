import type { ToolName } from '@codebuff/common/tools/constants'
import type {
  ClientToolCall,
  ClientToolName,
  CodebuffToolCall,
  CodebuffToolOutput,
  CodebuffToolResult,
} from '@codebuff/common/tools/list'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { AgentRuntimeDeps } from '@codebuff/types/deps/agent-runtime'

type PresentOrAbsent<K extends PropertyKey, V> =
  | { [P in K]: V }
  | { [P in K]: never }

export type CodebuffToolHandlerFunction<T extends ToolName = ToolName> = (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<T>

    agentStepId: string
    clientSessionId: string
    userInputId: string
    fileContext: ProjectFileContext

    fullResponse: string

    writeToClient: (chunk: string | PrintModeEvent) => void

    getLatestState: () => any
    state: { [K in string]?: any }
  } & PresentOrAbsent<
    'requestClientToolCall',
    (
      toolCall: ClientToolCall<T extends ClientToolName ? T : never>,
    ) => Promise<CodebuffToolOutput<T extends ClientToolName ? T : never>>
  > &
    AgentRuntimeDeps,
) => {
  result: Promise<CodebuffToolResult<T>['output']>
  state?: Record<string, any>
}
