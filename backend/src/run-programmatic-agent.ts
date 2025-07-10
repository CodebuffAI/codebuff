import {
  AgentState,
  AgentTemplateType,
} from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { WebSocket } from 'ws'
import { runTool } from './run-tool'
import {
  ProgrammaticAgentContext,
  ProgrammaticAgentTemplate,
} from './templates/types'
import { CodebuffToolCall } from './tools/constants'
import { logger } from './util/logger'
import { getRequestContext } from './websockets/request-context'

// Function to handle programmatic agents
export async function runProgrammaticAgent(
  template: ProgrammaticAgentTemplate,
  options: {
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
    ws: WebSocket
  }
): Promise<AgentState> {
  const {
    agentState,
    onResponseChunk,
    ws,
    userId,
    userInputId,
    clientSessionId,
    fingerprintId,
    fileContext,
  } = options

  logger.info(
    {
      template: template.id,
      agentType: options.agentType,
      prompt: options.prompt,
      params: options.params,
    },
    'Running programmatic agent'
  )
  // Create context for the programmatic agent
  const context: ProgrammaticAgentContext = {
    prompt: options.prompt || '',
    params: options.params || {},
  }

  try {
    // Run the generator function and handle tool calls
    const generator = template.handler(context)
    let result = generator.next()

    // Process tool calls yielded by the generator
    while (!result.done) {
      const toolCallWithoutId = result.value
      const toolCall = {
        ...toolCallWithoutId,
        toolCallId: crypto.randomUUID(),
      } as CodebuffToolCall

      // Generate a unique agent step ID for this tool execution
      const agentStepId = crypto.randomUUID()

      // Get the extracted repo ID from request context
      const requestContext = getRequestContext()
      const repoId = requestContext?.processedRepoId

      // Execute the tool call using the simplified wrapper
      const toolResult = await runTool(toolCall, {
        ws,
        userId,
        userInputId,
        clientSessionId,
        fingerprintId,
        agentStepId,
        fileContext,
        messages: agentState.messageHistory,
        agentTemplate: template,
        repoId,
        agentState,
      })

      // Send the tool result back to the generator
      result = generator.next(toolResult)

      if (result.value && result.value.toolName === 'end_turn') {
        break
      }
    }

    logger.info(
      { report: agentState.report },
      'Programmatic agent execution completed'
    )
    return agentState
  } catch (error) {
    logger.error(
      { error, template: template.id },
      'Programmatic agent execution failed'
    )

    const errorMessage = `Error executing programmatic agent: ${error instanceof Error ? error.message : 'Unknown error'}`
    onResponseChunk(errorMessage)

    agentState.report.error = errorMessage

    return agentState
  }
}
