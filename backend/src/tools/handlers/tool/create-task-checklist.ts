import { generateTaskChecklist } from '../../definitions/tool/create-task-checklist'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleCreateTaskChecklist = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'create_task_checklist'>
  state: any
}): {
  result: Promise<CodebuffToolOutput<'create_task_checklist'>>
  state: any
} => {
  const { previousToolCallFinished, toolCall } = params

  return {
    result: (async () => {
      await previousToolCallFinished
      
      try {
        const checklist = generateTaskChecklist(toolCall.input)
        
        return [
          {
            type: 'json',
            value: {
              checklist,
              message: `Created task checklist with ${checklist.items.length} items. Use this to track progress and ensure complete implementation.`,
            },
          },
        ]
      } catch (error) {
        return [
          {
            type: 'json',
            value: {
              checklist: null,
              message: `Error creating task checklist: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          },
        ]
      }
    })(),
    state: params.state,
  }
}) satisfies CodebuffToolHandlerFunction<'create_task_checklist'>
