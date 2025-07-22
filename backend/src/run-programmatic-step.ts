import {
  AgentState,
  AgentTemplateType,
  ToolResult,
} from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { WebSocket } from 'ws'
import { AgentTemplate, StepGenerator } from './templates/types'
import { CodebuffToolCall } from './tools/constants'
import {
  createToolExecutionContext,
  executeSingleTool,
} from './tools/tool-executor'
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
    prompt: string | undefined
    params: Record<string, any> | undefined
    userId: string | undefined
    userInputId: string
    clientSessionId: string
    fingerprintId: string
    onResponseChunk: (chunk: string) => void
    agentType: AgentTemplateType
    fileContext: ProjectFileContext
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
    generator = template.handleStep({
      agentState,
      prompt: params.prompt,
      params: params.params,
    })
    agentIdToGenerator[agentState.agentId] = generator
  }
  if (generator === 'STEP_ALL') {
    return { agentState, endTurn: false }
  }

  const agentStepId = crypto.randomUUID()

  const requestContext = getRequestContext()
  const repoId = requestContext?.processedRepoId

  const toolContext = createToolExecutionContext({
    ws,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoId,
    agentTemplate: template,
    fileContext,
    onResponseChunk,
    agentState,
    messages: agentState.messageHistory,
  })

  let toolResult: ToolResult | undefined
  let endTurn = false

  try {
    // Execute tools synchronously as the generator yields them
    do {
      let result = generator.next({
        agentState: { ...toolContext.state.mutableState.agentState },
        toolResult,
      })
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

      logger.debug(
        { toolCall },
        `${toolCall.toolName} (${toolCall.toolCallId}) tool call from programmatic agent`
      )

      // Execute the tool synchronously and get the result immediately
      toolResult = await executeSingleTool(toolCall, toolContext)

      if (toolCall.toolName === 'end_turn') {
        endTurn = true
        break
      }
    } while (true)

    const { mutableState } = toolContext.state
    logger.info(
      { report: mutableState.agentState.report },
      'Programmatic agent execution completed'
    )

    return { agentState: mutableState.agentState, endTurn }
  } catch (error) {
    logger.error(
      { error, template: template.id },
      'Programmatic agent execution failed'
    )

    const errorMessage = `Error executing programmatic agent: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
    onResponseChunk(errorMessage)

    const { mutableState } = toolContext.state
    mutableState.agentState.report.error = errorMessage

    return {
      agentState: mutableState.agentState,
      endTurn: true,
    }
  }
}
