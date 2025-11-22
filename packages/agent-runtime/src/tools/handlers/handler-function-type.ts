import type { FileProcessingState } from './tool/write-file'
import type { ToolName } from '@codebuff/common/tools/constants'
import type {
  ClientToolCall,
  ClientToolName,
  CodebuffToolCall,
  CodebuffToolMessage,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { SendSubagentChunkFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentState } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

type PresentOrAbsent<K extends PropertyKey, V> =
  | { [P in K]: V }
  | { [P in K]: never }
export type State = {
  creditsUsed?: number | Promise<number>
  sendSubagentChunk: SendSubagentChunkFn
  agentState: AgentState
  prompt: string | undefined
  fullResponse: string | undefined
  agentContext: Record<
    string,
    {
      logs: string[]
      objective?: string | undefined
      status?:
        | 'NOT_STARTED'
        | 'IN_PROGRESS'
        | 'COMPLETE'
        | 'ABORTED'
        | undefined
      plan?: string | undefined
    }
  >
  messages: Message[]
  system: string
  logger: Logger
} & FileProcessingState

export type CodebuffToolHandlerFunction<T extends ToolName = ToolName> = (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<T>

    agentStepId: string
    agentTemplate: AgentTemplate
    ancestorRunIds: string[]
    apiKey: string
    clientSessionId: string
    fileContext: ProjectFileContext
    fingerprintId: string
    fullResponse: string
    localAgentTemplates: Record<string, AgentTemplate>
    repoId: string | undefined
    repoUrl: string | undefined
    runId: string
    signal: AbortSignal
    state: State
    userId: string | undefined
    userInputId: string

    fetch: typeof globalThis.fetch
    getLatestState: () => State
    trackEvent: TrackEventFn
    writeToClient: (chunk: string | PrintModeEvent) => void
  } & PresentOrAbsent<
    'requestClientToolCall',
    (
      toolCall: ClientToolCall<T extends ClientToolName ? T : never>,
    ) => Promise<CodebuffToolOutput<T extends ClientToolName ? T : never>>
  > &
    AgentRuntimeDeps &
    AgentRuntimeScopedDeps,
) => {
  result: Promise<CodebuffToolMessage<T>['content']>
  state?: Partial<State>
}
