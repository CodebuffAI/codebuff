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
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentState, Subgoal } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

type PresentOrAbsent<K extends PropertyKey, V> =
  | { [P in K]: V }
  | { [P in K]: never }

export type $ToolHandlerFunction<T extends ToolName = ToolName> = (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<T>

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
    trackEvent: TrackEventFn
    userId: string | undefined
    userInputId: string
    writeToClient: (chunk: string | PrintModeEvent) => void
  } & PresentOrAbsent<
    'requestClientToolCall',
    (
      toolCall: ClientToolCall<T extends ClientToolName ? T : never>,
    ) => Promise<CodebuffToolOutput<T extends ClientToolName ? T : never>>
  > &
    AgentRuntimeDeps &
    AgentRuntimeScopedDeps,
) => Promise<{
  output: CodebuffToolMessage<T>['content']
  creditsUsed?: number
}>

export function validateToolHandler<T extends ToolName>(
  handler: $ToolHandlerFunction<T>,
) {
  const handlerWithToolName = async (...input: Parameters<typeof handler>) => {
    const result = await handler(...input)
    return { toolName: input[0].toolCall.toolName, ...result }
  }

  handlerWithToolName.__validated = true as const
  return handlerWithToolName satisfies ValidatedToolHandler<T>
}
export type ValidatedToolHandler<T extends ToolName = ToolName> = {
  (
    ...input: Parameters<$ToolHandlerFunction<T>>
  ): Promise<
    {
      [K in T]: { toolName: T } & Awaited<ReturnType<$ToolHandlerFunction<T>>>
    }[T]
  >
  __validated: true
}
