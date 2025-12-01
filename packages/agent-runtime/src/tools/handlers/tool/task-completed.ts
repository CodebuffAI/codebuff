import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleTaskCompleted = (async ({
  previousToolCallFinished,
}: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebuffToolCall<'task_completed'>
}): Promise<{ output: CodebuffToolOutput<'task_completed'> }> => {
  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'Task completed.' } }] }
}) satisfies CodebuffToolHandlerFunction<'task_completed'>
