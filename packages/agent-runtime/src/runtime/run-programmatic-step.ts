import { getToolCallString } from '@codebuff/common/tools/utils'
import { getErrorObject } from '@codebuff/common/util/error'

import { executeToolCall } from '../tools/tool-executor'
import type { AgentRuntimeEnvironment } from './interfaces'

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

// Maintains generator state for all agents. Generator state can't be serialized, so we store it in memory.
const agentIdToGenerator: Record<string, StepGenerator | undefined> = {}
export const agentIdToStepAll: Set<string> = new Set()

// Function to clear the generator cache for testing purposes
export function clearAgentGeneratorCache() {
  for (const key in agentIdToGenerator) {
    delete agentIdToGenerator[key]
  }
  agentIdToStepAll.clear()
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
    localAgentTemplates,
    stepsComplete,
    env,
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
    localAgentTemplates: Record<string, AgentTemplate>
    stepsComplete: boolean
    env: AgentRuntimeEnvironment
  },
): Promise<{ agentState: AgentState; endTurn: boolean }> {
  if (!template.handleSteps) {
    throw new Error('No step handler found for agent template ' + template.id)
  }

  // Run with a generator (QuickJS sandbox is handled by the backend environment)
  let generator = agentIdToGenerator[agentState.agentId]

  // Check if we need to initialize a generator
  if (!generator) {
    if (typeof template.handleSteps === 'function') {
      // Initialize native generator
      generator = template.handleSteps({
        agentState,
        prompt,
        params,
      })
      agentIdToGenerator[agentState.agentId] = generator
    } else {
      throw new Error(
        'String-based handleSteps should be handled by backend environment',
      )
    }
  }

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

  // Initialize state for tool execution
  const toolCalls: CodebuffToolCall[] = []
  const toolResults: ToolResult[] = []
  const state = {
    fingerprintId,
    userId,
    repoId: env.requestContext?.processedRepoId,
    agentTemplate: template,
    localAgentTemplates,
    sendSubagentChunk: (data: {
      userInputId: string
      agentId: string
      agentType: string
      chunk: string
      prompt?: string
    }) => {
      // Send subagent chunk through IO environment
      if (env.io.onResponseChunk) {
        env.io.onResponseChunk({
          type: 'text',
          text: data.chunk,
        } as PrintModeEvent)
      }
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
      const result = generator!.next({
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
        env,
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

    return { agentState: state.agentState, endTurn }
  } catch (error) {
    endTurn = true

    const errorMessage = `Error executing handleSteps for agent ${template.id}: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
    env.logger?.error(
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
      delete agentIdToGenerator[agentState.agentId]
      agentIdToStepAll.delete(agentState.agentId)
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
