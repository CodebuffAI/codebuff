import { getToolCallString } from '@codebuff/common/tools/utils'
import { getErrorObject } from '@codebuff/common/util/error'

import { executeToolCall } from './tools/tool-executor'
import { logger } from './util/logger'
import { SandboxManager } from './util/quickjs-sandbox'
import { getRequestContext } from './websockets/request-context'
import { sendAction } from './websockets/websocket-action'

import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type {
  AgentTemplate,
  StepGenerator,
  PublicAgentState,
} from '@codebuff/common/types/agent-template'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentState,
  AgentTemplateType,
  ToolResult,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

// Global sandbox manager for QuickJS contexts
const sandboxManager = new SandboxManager()

// Maintains generator state for all agents. Generator state can't be serialized, so we store it in memory.
const agentIdToGenerator: Record<string, StepGenerator | undefined> = {}
export const agentIdToStepAll: Set<string> = new Set()

// Function to clear the generator cache for testing purposes
export function clearAgentGeneratorCache() {
  for (const key in agentIdToGenerator) {
    delete agentIdToGenerator[key]
  }
  agentIdToStepAll.clear()
  // Clean up QuickJS sandboxes
  sandboxManager.dispose()
}

// Function to handle programmatic agents
export async function runProgrammaticStep(
  agentState: AgentState,
  {
    template,
    prompt,
    params,
    userId,
    userInputId,
    clientSessionId,
    fingerprintId,
    onResponseChunk,
    agentType,
    fileContext,
    ws,
    localAgentTemplates,
    stepsComplete,
  }: {
    template: AgentTemplate
    prompt: string | undefined
    params: Record<string, any> | undefined
    userId: string | undefined
    userInputId: string
    clientSessionId: string
    fingerprintId: string
    onResponseChunk: (chunk: string | PrintModeEvent) => void
    agentType: AgentTemplateType
    fileContext: ProjectFileContext
    ws: WebSocket
    localAgentTemplates: Record<string, AgentTemplate>
    stepsComplete: boolean
  },
): Promise<{ agentState: AgentState; endTurn: boolean }> {
  if (!template.handleSteps) {
    throw new Error('No step handler found for agent template ' + template.id)
  }

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
          prompt,
          params,
        },
      )
    } else {
      // Initialize native generator
      generator = template.handleSteps({
        agentState,
        prompt,
        params,
      })
      agentIdToGenerator[agentState.agentId] = generator
    }
  }

  // [storage] mode and sizes
  const sizeof = (v: any) =>
    Buffer.byteLength(typeof v === 'string' ? v : JSON.stringify(v), 'utf8')
  try {
    logger.info(
      {
        tag: 'storage',
        agentId: agentState.agentId,
        mode: sandbox ? 'quickjs' : 'native',
        hasSandbox: !!sandbox,
        hasGenerator: !!generator,
        initialMessageBytes: sizeof(agentState.messageHistory),
        initialMessageCount: agentState.messageHistory.length,
      },
      '[storage] programmatic-step start',
    )
  } catch (_) {}

  // Check if we're in STEP_ALL mode
  if (agentIdToStepAll.has(agentState.agentId)) {
    if (stepsComplete) {
      // Clear the STEP_ALL mode. Stepping can continue if handleSteps doesn't return.
      agentIdToStepAll.delete(agentState.agentId)
    } else {
      return { agentState, endTurn: false }
    }
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
    localAgentTemplates,
    sendSubagentChunk: (data: {
      userInputId: string
      agentId: string
      agentType: string
      chunk: string
      prompt?: string
    }) => {
      sendAction(ws, {
        type: 'subagent-response-chunk',
        ...data,
      })
    },
    agentState: { ...agentState },
    agentContext: agentState.agentContext,
    messages: agentState.messageHistory.map((msg) => ({ ...msg })),
  }

  let toolResult: string | undefined
  let endTurn = false

  try {
    // Execute tools synchronously as the generator yields them
    do {
      const result = sandbox
        ? await sandbox.executeStep({
            agentState: getPublicAgentState(state.agentState),
            toolResult,
            stepsComplete,
          })
        : generator!.next({
            agentState: getPublicAgentState(state.agentState),
            toolResult,
            stepsComplete,
          })

      if (result.done) {
        endTurn = true
        break
      }
      if (result.value === 'STEP') {
        break
      }
      if (result.value === 'STEP_ALL') {
        agentIdToStepAll.add(agentState.agentId)
        break
      }

      // Process tool calls yielded by the generator
      const toolCallWithoutId = result.value
      const toolCall = {
        ...toolCallWithoutId,
        toolCallId: crypto.randomUUID(),
      } as CodebuffToolCall

      if (!template.toolNames.includes(toolCall.toolName)) {
        throw new Error(
          `Tool ${toolCall.toolName} is not available for agent ${template.id}. Available tools: ${template.toolNames.join(', ')}`,
        )
      }

      // Add assistant message with the tool call before executing it
      // Exception: don't add tool call message for add_message since it adds its own message
      if (toolCall.toolName !== 'add_message') {
        const toolCallString = getToolCallString(
          toolCall.toolName,
          toolCall.input,
        )
        state.messages.push({
          role: 'assistant' as const,
          content: toolCallString,
        })
        state.sendSubagentChunk({
          userInputId,
          agentId: agentState.agentId,
          agentType: agentState.agentType!,
          chunk: toolCallString,
        })
      }

      // Execute the tool synchronously and get the result immediately
      await executeToolCall({
        toolName: toolCall.toolName,
        input: toolCall.input,
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

      // TODO: Remove messages from state and always use agentState.messageHistory.
      // Sync state.messages back to agentState.messageHistory
      state.agentState.messageHistory = state.messages

      // Get the latest tool result
      toolResult = toolResults[toolResults.length - 1]?.output.value

      if (toolCall.toolName === 'end_turn') {
        endTurn = true
        break
      }
    } while (true)

    // [storage] summarize sizes for this step
    try {
      logger.info(
        {
          tag: 'storage',
          agentId: state.agentState.agentId,
          mode: sandbox ? 'quickjs' : 'native',
          toolCallCount: toolCalls.length,
          toolResultsCount: toolResults.length,
          toolResultsBytes: sizeof(toolResults),
          messagesBytes: sizeof(state.messages),
          messagesCount: state.messages.length,
        },
        '[storage] programmatic-step results',
      )
    } catch (_) {}

    return { agentState: state.agentState, endTurn }
  } catch (error) {
    endTurn = true

    const errorMessage = `Error executing handleSteps for agent ${template.id}: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
    logger.error(
      { error: getErrorObject(error), template: template.id },
      errorMessage,
    )

    onResponseChunk(errorMessage)

    state.agentState.messageHistory = [
      ...state.messages,
      {
        role: 'assistant' as const,
        content: errorMessage,
      },
    ]
    state.agentState.output = {
      ...state.agentState.output,
      error: errorMessage,
    }

    return {
      agentState: state.agentState,
      endTurn,
    }
  } finally {
    if (endTurn) {
      if (sandbox) {
        // Clean up QuickJS sandbox if execution is complete
        sandboxManager.removeSandbox(agentState.agentId)
      }
      delete agentIdToGenerator[agentState.agentId]
      agentIdToStepAll.delete(agentState.agentId)
      // [storage] cleanup lifecycle
      try {
        logger.info(
          {
            tag: 'storage',
            agentId: agentState.agentId,
            cleanedSandbox: !!sandbox,
            cleanedGenerator: true,
          },
          '[storage] programmatic-step cleanup',
        )
      } catch (_) {}
    }
  }
}

export const getPublicAgentState = (
  agentState: AgentState,
): PublicAgentState => {
  const { agentId, parentId, messageHistory, output } = agentState
  return {
    agentId,
    parentId,
    messageHistory: messageHistory as any as PublicAgentState['messageHistory'],
    output,
  }
}
