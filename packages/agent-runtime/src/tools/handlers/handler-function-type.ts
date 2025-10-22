import type { ToolName } from '@codebuff/common/tools/constants'
import type {
  ClientToolCall,
  ClientToolName,
  CodebuffToolCall,
  CodebuffToolOutput,
  CodebuffToolResult,
} from '@codebuff/common/tools/list'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { ProjectFileContext } from '@codebuff/common/util/file'

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
    repoUrl: string | undefined
    repoId: string | undefined
    fileContext: ProjectFileContext

    fullResponse: string
    fetch: typeof globalThis.fetch

    writeToClient: (chunk: string | PrintModeEvent) => void
    trackEvent: TrackEventFn

    getLatestState: () => any
    state: { [K in string]?: any }
  } & PresentOrAbsent<
    'requestClientToolCall',
    (
      toolCall: ClientToolCall<T extends ClientToolName ? T : never>,
    ) => Promise<CodebuffToolOutput<T extends ClientToolName ? T : never>>
  > &
    AgentRuntimeDeps &
    AgentRuntimeScopedDeps,
) => {
  result: Promise<CodebuffToolResult<T>['output']>
  state?: Record<string, any>
}
