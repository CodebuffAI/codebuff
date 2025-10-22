import { getToolCallString } from '@codebuff/common/tools/utils'
import { getErrorObject } from '@codebuff/common/util/error'
import { cloneDeep } from 'lodash'

import { executeToolCall } from './tools/tool-executor'
import { SandboxManager } from './util/quickjs-sandbox'

import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type {
  AgentTemplate,
  StepGenerator,
  PublicAgentState,
} from '@codebuff/common/types/agent-template'
import type {
  HandleStepsLogChunkFn,
  SendActionFn,
} from '@codebuff/common/types/contracts/client'
import type { AddAgentStepFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ParamsExcluding,
  ParamsOf,
} from '@codebuff/common/types/function-params'
import type {
  ToolResultOutput,
  ToolResultPart,
} from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentState } from '@codebuff/common/types/session-state'

// Global sandbox manager for QuickJS contexts
const sandboxManager = new SandboxManager()

// Maintains generator state for all agents. Generator state can't be serialized, so we store it in memory.
const runIdToGenerator: Record<string, StepGenerator | undefined> = {}
export const runIdToStepAll: Set<string> = new Set()

// Function to clear the generator cache for testing purposes
export function clearAgentGeneratorCache(
  params: ParamsOf<typeof sandboxManager.dispose>,
) {
  for (const key in runIdToGenerator) {
    delete runIdToGenerator[key]
  }
  runIdToStepAll.clear()
  // Clean up QuickJS sandboxes
  sandboxManager.dispose(params)
}

// Function to handle programmatic agents
export async function runProgrammaticStep(
  params: {
    agentState: AgentState
    template: AgentTemplate
    prompt: string | undefined
    toolCallParams: Record<string, any> | undefined
    system: string | undefined
    userId: string | undefined
    repoId: string | undefined
    repoUrl: string | undefined
    userInputId: string
    fingerprintId: string
    onResponseChunk: (chunk: string | PrintModeEvent) => void
    localAgentTemplates: Record<string, AgentTemplate>
    stepsComplete: boolean
    stepNumber: number
    handleStepsLogChunk: HandleStepsLogChunkFn
    sendAction: SendActionFn
    addAgentStep: AddAgentStepFn
    logger: Logger
  } & ParamsExcluding<
    typeof executeToolCall,
    | 'toolName'
    | 'input'
    | 'toolCalls'
    | 'toolResults'
    | 'toolResultsToAddAfterStream'
    | 'previousToolCallFinished'
    | 'agentStepId'
    | 'agentTemplate'
    | 'fullResponse'
    | 'autoInsertEndStepParam'
    | 'state'
    | 'excludeToolFromMessageHistory'
  > &
    ParamsExcluding<
      AddAgentStepFn,
      | 'agentRunId'
      | 'stepNumber'
      | 'credits'
      | 'childRunIds'
      | 'status'
      | 'startTime'
      | 'messageId'
    >,
): Promise<{ agentState: AgentState; endTurn: boolean; stepNumber: number }> {
  const {
    agentState,
    template,
    prompt,
    toolCallParams,
    system,
    userId,
    userInputId,
    repoId,
    fingerprintId,
    onResponseChunk,
    localAgentTemplates,
    stepsComplete,
    handleStepsLogChunk,
    sendAction,
    addAgentStep,
    logger,
  } = params
  let { stepNumber } = params

  if (!template.handleSteps) {
    throw new Error('No step handler found for agent template ' + template.id)
  }

  if (!agentState.runId) {
    throw new Error('Agent state has no run ID')
  }

  // Run with either a generator or a sandbox.
  let generator = runIdToGenerator[agentState.runId]
  let sandbox = sandboxManager.getSandbox({ runId: agentState.runId })

  // Check if we need to initialize a generator
  if (!generator && !sandbox) {
    const createLogMethod =
      (level: 'debug' | 'info' | 'warn' | 'error') =>
      (data: any, msg?: string) => {
        logger[level](data, msg) // Log to backend
        handleStepsLogChunk({
          userInputId,
          runId: agentState.runId ?? 'undefined',
          level,
          data,
          message: msg,
        })
      }

    const streamingLogger = {
      debug: createLogMethod('debug'),
      info: createLogMethod('info'),
      warn: createLogMethod('warn'),
      error: createLogMethod('error'),
    }

    if (typeof template.handleSteps === 'string') {
      // Initialize QuickJS sandbox for string-based generator
      sandbox = await sandboxManager.getOrCreateSandbox({
        runId: agentState.runId,
        generatorCode: template.handleSteps,
        initialInput: {
          agentState,
          prompt,
          params: toolCallParams,
          logger: streamingLogger,
        },
        config: undefined, // config
        sandboxLogger: streamingLogger, // pass the streaming logger instance for internal use
        logger,
      })
    } else {
      // Initialize native generator
      generator = template.handleSteps({
        agentState,
        prompt,
        params,
        logger: streamingLogger,
      })
      runIdToGenerator[agentState.runId] = generator
    }
  }

  // Check if we're in STEP_ALL mode
  if (runIdToStepAll.has(agentState.runId)) {
    if (stepsComplete) {
      // Clear the STEP_ALL mode. Stepping can continue if handleSteps doesn't return.
      runIdToStepAll.delete(agentState.runId)
    } else {
      return { agentState, endTurn: false, stepNumber }
    }
  }

  const agentStepId = crypto.randomUUID()

  // Initialize state for tool execution
  const toolCalls: CodebuffToolCall[] = []
  const toolResults: ToolResultPart[] = []
  const state = {
    fingerprintId,
    userId,
    agentTemplate: template,
    localAgentTemplates,
    system,
    sendSubagentChunk: (data: {
      userInputId: string
      agentId: string
      agentType: string
      chunk: string
      prompt?: string
      forwardToPrompt?: boolean
    }) => {
      sendAction({
        action: {
          type: 'subagent-response-chunk',
          ...data,
        },
      })
    },
    agentState: cloneDeep({
      ...agentState,
      runId: agentState.runId!, // We've already verified runId exists above
    }),
    agentContext: cloneDeep(agentState.agentContext),
    messages: cloneDeep(agentState.messageHistory),
  }

  let toolResult: ToolResultOutput[] = []
  let endTurn = false

  let startTime = new Date()
  let creditsBefore = agentState.directCreditsUsed
  let childrenBefore = agentState.childRunIds.length

  try {
    // Execute tools synchronously as the generator yields them
    do {
      startTime = new Date()
      creditsBefore = state.agentState.directCreditsUsed
      childrenBefore = state.agentState.childRunIds.length

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
        runIdToStepAll.add(state.agentState.runId)
        break
      }

      // Process tool calls yielded by the generator
      const toolCallWithoutId = result.value
      const toolCall = {
        ...toolCallWithoutId,
        toolCallId: crypto.randomUUID(),
      } as CodebuffToolCall & {
        includeToolCall?: boolean
      }

      // Note: We don't check if the tool is available for the agent template anymore.
      // You can run any tool from handleSteps now!
      // if (!template.toolNames.includes(toolCall.toolName)) {
      //   throw new Error(
      //     `Tool ${toolCall.toolName} is not available for agent ${template.id}. Available tools: ${template.toolNames.join(', ')}`,
      //   )
      // }

      const excludeToolFromMessageHistory = toolCall?.includeToolCall === false
      // Add assistant message with the tool call before executing it
      if (!excludeToolFromMessageHistory) {
        const toolCallString = getToolCallString(
          toolCall.toolName,
          toolCall.input,
        )
        onResponseChunk(toolCallString)
        state.messages.push({
          role: 'assistant' as const,
          content: toolCallString,
        })
        // Optional call handles both top-level and nested agents
        state.sendSubagentChunk?.({
          userInputId,
          agentId: state.agentState.agentId,
          agentType: state.agentState.agentType!,
          chunk: toolCallString,
          forwardToPrompt: !state.agentState.parentId,
        })
      }

      // Execute the tool synchronously and get the result immediately
      // Wrap onResponseChunk to add parentAgentId to nested agent events
      await executeToolCall({
        ...params,
        toolName: toolCall.toolName,
        input: toolCall.input,
        toolCalls,
        toolResults,
        toolResultsToAddAfterStream: [],
        previousToolCallFinished: Promise.resolve(),
        agentTemplate: template,
        agentStepId,
        fullResponse: '',
        state,
        autoInsertEndStepParam: true,
        excludeToolFromMessageHistory,
        fromHandleSteps: true,
        onResponseChunk: (chunk: string | PrintModeEvent) => {
          if (typeof chunk === 'string') {
            onResponseChunk(chunk)
            return
          }

          // Only add parentAgentId if this programmatic agent has a parent (i.e., it's nested)
          // This ensures we don't add parentAgentId to top-level spawns
          if (state.agentState.parentId) {
            const parentAgentId = state.agentState.agentId

            switch (chunk.type) {
              case 'subagent_start':
              case 'subagent_finish':
                if (!chunk.parentAgentId) {
                  onResponseChunk({
                    ...chunk,
                    parentAgentId,
                  })
                  return
                }
                break
              case 'tool_call':
              case 'tool_result': {
                if (!chunk.parentAgentId) {
                  const debugPayload =
                    chunk.type === 'tool_call'
                      ? {
                          eventType: chunk.type,
                          agentId: chunk.agentId,
                          parentId: parentAgentId,
                        }
                      : {
                          eventType: chunk.type,
                          parentId: parentAgentId,
                        }
                  onResponseChunk({
                    ...chunk,
                    parentAgentId,
                  })
                  return
                }
                break
              }
              default:
                break
            }
          }

          // For other events or top-level spawns, send as-is
          onResponseChunk(chunk)
        },
      })

      // TODO: Remove messages from state and always use agentState.messageHistory.
      // Sync state.messages back to agentState.messageHistory
      state.agentState.messageHistory = state.messages

      // Get the latest tool result
      toolResult = toolResults[toolResults.length - 1]?.output

      if (state.agentState.runId) {
        await addAgentStep({
          ...params,
          agentRunId: state.agentState.runId,
          stepNumber,
          credits: state.agentState.directCreditsUsed - creditsBefore,
          childRunIds: state.agentState.childRunIds.slice(childrenBefore),
          status: 'completed',
          startTime,
          messageId: null,
        })
      } else {
        logger.error('No runId found for agent state after finishing agent run')
      }
      stepNumber++

      if (toolCall.toolName === 'end_turn') {
        endTurn = true
        break
      }
    } while (true)

    return { agentState: state.agentState, endTurn, stepNumber }
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

    if (agentState.runId) {
      await addAgentStep({
        ...params,
        agentRunId: agentState.runId,
        stepNumber,
        credits: agentState.directCreditsUsed - creditsBefore,
        childRunIds: agentState.childRunIds.slice(childrenBefore),
        status: 'skipped',
        startTime,
        errorMessage,
        messageId: null,
        logger,
      })
    } else {
      logger.error('No runId found for agent state after failed agent run')
    }
    stepNumber++

    return {
      agentState: state.agentState,
      endTurn,
      stepNumber,
    }
  } finally {
    if (endTurn) {
      if (sandbox) {
        // Clean up QuickJS sandbox if execution is complete
        sandboxManager.removeSandbox({ runId: agentState.runId, logger })
      }
      delete runIdToGenerator[agentState.runId]
      runIdToStepAll.delete(agentState.runId)
    }
  }
}

export const getPublicAgentState = (
  agentState: AgentState & Required<Pick<AgentState, 'runId'>>,
): PublicAgentState => {
  const { agentId, runId, parentId, messageHistory, output } = agentState
  return {
    agentId,
    runId,
    parentId,
    messageHistory: messageHistory as any as PublicAgentState['messageHistory'],
    output,
  }
}
