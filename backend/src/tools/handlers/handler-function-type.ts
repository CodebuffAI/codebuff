import type { ToolName } from '@codebuff/common/constants/tools'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { ClientToolCall, CodebuffToolCall } from '../constants'

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

    writeToClient: (chunk: string) => void

    getLatestState: () => any
    state: { [K in string]?: any }
  } & PresentOrAbsent<
    'requestClientToolCall',
    (toolCall: ClientToolCall<T>) => Promise<string>
  >
) => {
  result: Promise<string | undefined>
  state?: Record<string, any>
}
