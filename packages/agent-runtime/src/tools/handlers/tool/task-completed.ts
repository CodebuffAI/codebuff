import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleTaskCompleted = (({
  previousToolCallFinished,
}: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebuffToolCall<'task_completed'>
}): { result: Promise<CodebuffToolOutput<'task_completed'>>; state: {} } => {
  return {
    result: (async () => {
      await previousToolCallFinished
      return []
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'task_completed'>
