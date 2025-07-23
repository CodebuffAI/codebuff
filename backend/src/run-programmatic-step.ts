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
import { SandboxManager } from './util/quickjs-sandbox'
import { getRequestContext } from './websockets/request-context'

// Global sandbox manager for QuickJS contexts
const sandboxManager = new SandboxManager()

// Maintains generator state for all agents. Generator state can't be serialized, so we store it in memory.
const agentIdToGenerator: Record<
  string,
  StepGenerator | 'STEP_ALL' | undefined
> = {}

// Function to clear the generator cache for testing purposes
export function clearAgentGeneratorCache() {
  for (const key in agentIdToGenerator) {
    delete agentIdToGenerator[key]
  }
  // Clean up QuickJS sandboxes
  sandboxManager.dispose()
}

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
  if (!template.handleSteps) {
    throw new Error('No step handler found for agent template ' + template.id)
  }

  logger.info(
    {
      template: template.id,
      agentType: params.agentType,
      prompt: params.prompt,
      params: params.params,
    },
    'Running programmatic step'
  )

  // Run with either a generator or a sandbox.
  let generator = agentIdToGenerator[agentState.agentId]
  let sandbox = sandboxManager.getSandbox(agentState.agentId)

  // Check if we need to initialize a generator (either native or QuickJS-based)
  if (!generator && !sandbox) {
    if (typeof template.handleSteps === 'string') {
      // Initialize QuickJS sandbox for string-based generator
      sandbox = await sandboxManager.getOrCreateSandbox(
        agentState.agentId,
        template.handleSteps,
        {
          agentState,
          prompt: params.prompt,
          params: params.params,
        }
      )
    } else {
      // Initialize native generator
      generator = template.handleSteps({
        agentState,
        prompt: params.prompt,
        params: params.params,
      })
      agentIdToGenerator[agentState.agentId] = generator
    }
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
    ws,
    fingerprintId,
    userId,
    repoId,
    agentTemplate: template,
    agentState: { ...agentState },
    agentContext: agentState.agentContext,
    messages: [...agentState.messageHistory],
  }

  let toolResult: ToolResult | undefined
  let endTurn = false

  try {
    // Execute tools synchronously as the generator yields them
    do {
      const result = sandbox
        ? await sandbox.executeStep({
            agentState: { ...state.agentState },
            toolResult,
          })
        : generator!.next({
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
        `${toolCall.toolName} tool call from programmatic agent`
      )

      // Execute the tool synchronously and get the result immediately
      await executeToolCall({
        toolName: toolCall.toolName,
        args: toolCall.args,
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
        autoInsertEndStepParam: true,
      })

      // Get the latest tool result
      toolResult = toolResults[toolResults.length - 1]

      if (toolCall.toolName === 'end_turn') {
        endTurn = true
        break
      }
    } while (true)

    logger.info(
      { output: state.agentState.output },
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

    state.agentState.output = {
      ...state.agentState.output,
      error: errorMessage,
    }

    return {
      agentState: state.agentState,
      endTurn: true,
    }
  } finally {
    // Clean up QuickJS sandbox if execution is complete
    if (endTurn && sandbox) {
      sandboxManager.removeSandbox(agentState.agentId)
    }
  }
}
