import { buildArray } from '@codebuff/common/util/array'
import { jsonToolResult } from '@codebuff/common/util/messages'

import { validateToolHandler } from '../handler-function-type'

import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Subgoal } from '@codebuff/common/types/session-state'

type ToolName = 'add_subgoal'
export const handleAddSubgoal = validateToolHandler<ToolName>(
  async (params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>

    agentContext: Record<string, Subgoal>
  }): Promise<{
    output: CodebuffToolOutput<ToolName>
  }> => {
    const { previousToolCallFinished, toolCall, agentContext } = params

    agentContext[toolCall.input.id] = {
      objective: toolCall.input.objective,
      status: toolCall.input.status,
      plan: toolCall.input.plan,
      logs: buildArray([toolCall.input.log]),
    }

    await previousToolCallFinished
    return { output: jsonToolResult({ message: 'Successfully added subgoal' }) }
  },
)
