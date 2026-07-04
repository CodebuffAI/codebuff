import type { FileProcessingState } from './tool/write-file'
import type { ToolName } from '@codebirds/common/tools/constants'
import type {
  ClientToolCall,
  ClientToolName,
  CodebirdsToolCall,
  CodebirdsToolMessage,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'
import type { AgentTemplate } from '@codebirds/common/types/agent-template'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebirds/common/types/contracts/agent-runtime'
import type { TrackEventFn } from '@codebirds/common/types/contracts/analytics'
import type { SendSubagentChunkFn } from '@codebirds/common/types/contracts/client'
import type { Logger } from '@codebirds/common/types/contracts/logger'
import type { PrintModeEvent } from '@codebirds/common/types/print-mode'
import type { AgentState, Subgoal } from '@codebirds/common/types/session-state'
import type { ProjectFileContext } from '@codebirds/common/util/file'
import type { ToolSet } from 'ai'

type PresentOrAbsent<K extends PropertyKey, V> =
  | { [P in K]: V }
  | { [P in K]: never }

export type CodebirdsToolHandlerFunction<T extends ToolName = ToolName> = (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebirdsToolCall<T>

    agentContext: Record<string, Subgoal>
    agentState: AgentState
    agentStepId: string
    agentTemplate: AgentTemplate
    ancestorRunIds: string[]
    apiKey: string
    clientSessionId: string
    fetch: typeof globalThis.fetch
    fileContext: ProjectFileContext
    fileProcessingState: FileProcessingState
    fingerprintId: string
    fullResponse: string
    localAgentTemplates: Record<string, AgentTemplate>
    logger: Logger
    prompt: string | undefined
    repoId: string | undefined
    repoUrl: string | undefined
    runId: string
    sendSubagentChunk: SendSubagentChunkFn
    signal: AbortSignal
    system: string
    tools: ToolSet
    trackEvent: TrackEventFn
    userId: string | undefined
    userInputId: string
    writeToClient: (chunk: string | PrintModeEvent) => void
  } & PresentOrAbsent<
    'requestClientToolCall',
    (
      toolCall: ClientToolCall<T extends ClientToolName ? T : never>,
    ) => Promise<CodebirdsToolOutput<T extends ClientToolName ? T : never>>
  > &
    AgentRuntimeDeps &
    AgentRuntimeScopedDeps,
) => Promise<{
  output: CodebirdsToolMessage<T>['content']
  creditsUsed?: number
}>
