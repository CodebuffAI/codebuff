import { jsonToolResult } from '@codebuff/common/util/messages'

import { getAgentTemplate } from '../../../templates/agent-registry'
import { validateToolHandler } from '../handler-function-type'

import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type {
  AgentTemplate,
  Logger,
} from '@codebuff/common/types/agent-template'
import type { FetchAgentFromDatabaseFn } from '@codebuff/common/types/contracts/database'
import type { AgentState } from '@codebuff/common/types/session-state'

type ToolName = 'set_output'
export const handleSetOutput = validateToolHandler<ToolName>(
  async (params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>

    agentState: AgentState
    apiKey: string
    databaseAgentCache: Map<string, AgentTemplate | null>
    localAgentTemplates: Record<string, AgentTemplate>
    logger: Logger
    fetchAgentFromDatabase: FetchAgentFromDatabaseFn
  }): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
    const { previousToolCallFinished, toolCall, agentState, logger } = params
    const output = toolCall.input

    await previousToolCallFinished

    // Validate output against outputSchema if defined
    let agentTemplate = null
    if (agentState.agentType) {
      agentTemplate = await getAgentTemplate({
        ...params,
        agentId: agentState.agentType,
      })
    }
    if (agentTemplate?.outputSchema) {
      try {
        agentTemplate.outputSchema.parse(output)
      } catch (error) {
        const errorMessage = `Output validation error: Output failed to match the output schema and was ignored. You might want to try again! Issues: ${error}`
        logger.error(
          {
            output,
            agentType: agentState.agentType,
            agentId: agentState.agentId,
            error,
          },
          'set_output validation error',
        )
        return { output: jsonToolResult({ message: errorMessage }) }
      }
    }

    // Set the output (completely replaces previous output)
    agentState.output = output

    return { output: jsonToolResult({ message: 'Output set' }) }
  },
)
