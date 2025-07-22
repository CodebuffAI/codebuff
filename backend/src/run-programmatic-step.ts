import {
  AgentState,
  AgentTemplateType,
  ToolResult,
} from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { WebSocket } from 'ws'
import { runTool } from './run-tool'
import { AgentTemplate, StepGenerator } from './templates/types'
import { CodebuffToolCall } from './tools/constants'
import { logger } from './util/logger'
import { getRequestContext } from './websockets/request-context'

// Maintains generator state for all agents. Generator state can't be serialized, so we store it in memory.
const agentIdToGenerator: Record<
  string,
  StepGenerator | 'STEP_ALL' | undefined
> = {}

// Function to handle programmatic agents
export async function runProgrammaticStep(
  agentState: AgentState,
  params: {
    template: AgentTemplate
    userId: string | undefined
    userInputId: string
    clientSessionId: string
    fingerprintId: string
    onResponseChunk: (chunk: string) => void
    agentType: AgentTemplateType
    fileContext: ProjectFileContext
    prompt: string | undefined
    params: Record<string, any> | undefined
    assistantMessage: string | undefined
    assistantPrefix: string | undefined
    ws: WebSocket
  }
): Promise<{ agentState: AgentState; endTurn: boolean }> {
  const {
    template,
    onResponseChunk,
    ws,
    userId,
    userInputId,
    clientSessionId,
    fingerprintId,
    fileContext,
  } = params

  logger.info(
    {
      template: template.id,
      agentType: params.agentType,
      prompt: params.prompt,
      params: params.params,
    },
    'Running programmatic step'
  )

  let generator = agentIdToGenerator[agentState.agentId]
  if (!generator) {
    if (!template.handleStep) {
      throw new Error('No step handler found for agent template ' + template.id)
    }
    generator = template.handleStep(agentState)
    agentIdToGenerator[agentState.agentId] = generator
  }
  if (generator === 'STEP_ALL') {
    return { agentState, endTurn: false }
  }

  let toolResult: ToolResult | undefined
  let endTurn = false

  try {
    do {
      let result = generator.next({ agentState: { ...agentState }, toolResult })
      if (result.done) {
        endTurn = true
        break
      }
      if (result.value === 'STEP') {
        break
      }
      if (result.value === 'STEP_ALL') {
        agentIdToGenerator[agentState.agentId] = 'STEP_ALL'
        break
      }

      // Process tool calls yielded by the generator
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
      toolResult = await runTool(toolCall, {
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

      if (result.value && result.value.toolName === 'end_turn') {
        endTurn = true
        break
      }
    } while (true)
  } catch (error) {
    logger.error(
      { error, template: template.id },
      'Programmatic agent execution failed'
    )

    const errorMessage = `Error executing programmatic agent: ${error instanceof Error ? error.message : 'Unknown error'}`
    onResponseChunk(errorMessage)

    agentState.report.error = errorMessage

    return { agentState, endTurn: true }
  }

  logger.info(
    { report: agentState.report },
    'Programmatic agent execution completed'
  )

  return { agentState, endTurn }
}
