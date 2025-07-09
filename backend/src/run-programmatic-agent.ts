import {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'
import { generateCompactId } from '@codebuff/common/util/string'
import { ProjectFileContext } from '@codebuff/common/util/file'
import {
  ProgrammaticAgentTemplate,
  ProgrammaticAgentContext,
} from './templates/types'
import { logger } from './util/logger'

export interface AgentOptions {
  userId: string | undefined
  userInputId: string
  clientSessionId: string
  fingerprintId: string
  onResponseChunk: (chunk: string) => void
  agentType: AgentTemplateType
  fileContext: ProjectFileContext
  agentState: AgentState
  prompt: string | undefined
  params: Record<string, any> | undefined
  assistantMessage: string | undefined
  assistantPrefix: string | undefined
}

// Function to handle programmatic agents
export async function runProgrammaticAgent(
  template: ProgrammaticAgentTemplate,
  options: AgentOptions
): Promise<{
  agentState: AgentState
  fullResponse: string
  shouldEndTurn: boolean
}> {
  const { agentState, onResponseChunk } = options

  // Create context for the programmatic agent
  const context: ProgrammaticAgentContext = {
    prompt: options.prompt || '',
    params: options.params || {},
  }

  try {
    // Run the generator function directly
    const generator = template.handler(context)
    let result = generator.next()

    // For now, just get the final result
    // TODO: Handle tool calls yielded by the generator
    while (!result.done) {
      // Skip tool calls for now - we'll implement this later
      result = generator.next({
        toolName: 'placeholder' as any,
        toolCallId: generateCompactId(),
        result: 'Tool executed',
      })
    }

    const finalResult = result.value
    const report =
      typeof finalResult === 'object' ? finalResult : { result: finalResult }
    const fullResponse =
      typeof finalResult === 'string'
        ? finalResult
        : JSON.stringify(finalResult)

    onResponseChunk(fullResponse)

    return {
      agentState: {
        ...agentState,
        stepsRemaining: agentState.stepsRemaining - 1,
        report,
      },
      fullResponse,
      shouldEndTurn: true, // Programmatic agents complete in one step
    }
  } catch (error) {
    logger.error(
      { error, template: template.type },
      'Programmatic agent execution failed'
    )

    const errorMessage = `Error executing programmatic agent: ${error instanceof Error ? error.message : 'Unknown error'}`
    onResponseChunk(errorMessage)

    return {
      agentState: {
        ...agentState,
        stepsRemaining: agentState.stepsRemaining - 1,
      },
      fullResponse: errorMessage,
      shouldEndTurn: true,
    }
  }
}
