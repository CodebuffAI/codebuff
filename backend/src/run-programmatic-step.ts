import {
  AgentState,
  AgentTemplateType,
  ToolResult,
} from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { WebSocket } from 'ws'
import { AgentTemplate, StepGenerator } from './templates/types'
import { CodebuffToolCall } from './tools/constants'
import { executeToolCall } from './tools/tool-executor'
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

  // Initialize state for tool execution
  const toolCalls: CodebuffToolCall[] = []
  const toolResults: ToolResult[] = []
  const state = {
    messages: [...agentState.messageHistory],
    agentState: { ...agentState },
  }

  let toolResult: ToolResult | undefined
  let endTurn = false

  try {
    // Execute tools synchronously as the generator yields them
    do {
      let result = generator.next({
        agentState: { ...state.agentState },
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
      await executeToolCall({
        toolName: toolCall.toolName,
        args: Object.fromEntries(
          Object.entries(toolCall.args).map(([k, v]) => [k, String(v)])
        ),
        toolCalls,
        toolResults,
        previousToolCallFinished: Promise.resolve(),
        ws,
        agentTemplate: template,
        fileContext,
        agentStepId,
        clientSessionId,
        userInputId,
        fullResponse: '',
        onResponseChunk,
        state,
        userId,
      })

      // Get the latest tool result
      toolResult = toolResults[toolResults.length - 1]

      if (toolCall.toolName === 'end_turn') {
        endTurn = true
        break
      }
    } while (true)

    logger.info(
      { report: state.agentState.report },
      'Programmatic agent execution completed'
    )

    return { agentState: state.agentState, endTurn }
  } catch (error) {
    logger.error(
      { error, template: template.id },
      'Programmatic agent execution failed'
    )

    const errorMessage = `Error executing programmatic agent: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
    onResponseChunk(errorMessage)

    state.agentState.report.error = errorMessage

    return {
      agentState: state.agentState,
      endTurn: true,
    }
  }
}
