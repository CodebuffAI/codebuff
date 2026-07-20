import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleCloudPlanReady = (async (params: {
  previousToolCallFinished: Promise<unknown>
  toolCall: CodebuffToolCall<'cloud_plan_ready'>
}): Promise<{ output: CodebuffToolOutput<'cloud_plan_ready'> }> => {
  await params.previousToolCallFinished
  return {
    output: [
      {
        type: 'json',
        value: { message: 'The project plan is ready for approval.' },
      },
    ],
  }
}) satisfies CodebuffToolHandlerFunction<'cloud_plan_ready'>
