import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'

export const handleTaskCompleted = (async ({
  previousToolCallFinished,
}: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebirdsToolCall<'task_completed'>
}): Promise<{ output: CodebirdsToolOutput<'task_completed'> }> => {
  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'Task completed.' } }] }
}) satisfies CodebirdsToolHandlerFunction<'task_completed'>
