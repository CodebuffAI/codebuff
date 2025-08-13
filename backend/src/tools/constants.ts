import { endsAgentStepParam } from '@codebuff/common/tools/constants'

import type { codebuffToolDefs } from './definitions/list'
import type { FileChange } from '@codebuff/common/actions'
import type { ToolName } from '@codebuff/common/tools/constants'
import type { ToolCallPart } from 'ai'
import type { z } from 'zod/v4'

export const globalStopSequence = `${JSON.stringify(endsAgentStepParam)}`

// Tool call from LLM
export type CodebuffToolCall<T extends ToolName = ToolName> = {
  [K in ToolName]: {
    toolName: K
    input: z.infer<(typeof codebuffToolDefs)[K]['parameters']>
  } & Omit<ToolCallPart, 'type'>
}[T]

// Tool call to send to client
export type ClientToolCall<T extends ToolName = ToolName> = {
  [K in ToolName]: {
    toolName: K
    input: K extends 'run_terminal_command'
      ? CodebuffToolCall<'run_terminal_command'>['input'] & {
          mode: 'assistant' | 'user'
        }
      : K extends 'write_file' | 'str_replace' | 'create_plan'
        ? FileChange
        : CodebuffToolCall<K>['input']
  }
}[T] &
  Omit<ToolCallPart, 'type'>
