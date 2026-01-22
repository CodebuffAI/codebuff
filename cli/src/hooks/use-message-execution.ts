/**
 * Hook for core SDK message execution.
 * Handles agent resolution, client acquisition, and SDK run execution.
 */

import { useCallback } from 'react'

import {
  resolveAgent,
  buildPromptWithContext,
} from '../utils/agent-resolution'
import { getCodebuffClient } from '../utils/codebuff-client'
import { createEventHandlerState } from '../utils/create-event-handler-state'
import { createRunConfig } from '../utils/create-run-config'
import { loadAgentDefinitions } from '../utils/local-agent-registry'
import { logger } from '../utils/logger'

import type { StreamController } from './stream-state'
import type { StreamStatus } from './use-message-queue'
import type { AgentMode } from '../utils/constants'
import type { MessageUpdater } from '../utils/message-updater'
import type { MessageContent, RunState } from '@codebuff/sdk'
import type { MutableRefObject } from 'react'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Core message data to be sent */
export interface MessageData {
  /** The final prompt content to send */
  prompt: string
  /** Optional bash context to prepend to the prompt */
  bashContext: string
  /** Message content (images, etc.) */
  messageContent: MessageContent[] | undefined
  /** Current agent mode (DEFAULT, MAX, PLAN) */
  agentMode: AgentMode
}

/** Context for managing streaming state and UI updates */
export interface StreamingContext {
  /** AI message ID for the response */
  aiMessageId: string
  /** Stream controller for managing stream state */
  streamRefs: StreamController
  /** Message updater for updating AI message blocks */
  updater: MessageUpdater
  /** Ref tracking whether content has been received */
  hasReceivedContentRef: MutableRefObject<boolean>
}

/** Context for SDK execution */
export interface ExecutionContext {
  /** Previous run state for continuation */
  previousRunState: RunState | null
  /** Abort signal for cancellation */
  signal: AbortSignal
}

export interface StreamingCallbacks {
  setStreamingAgents: (updater: (prev: Set<string>) => Set<string>) => void
  setStreamStatus: (status: StreamStatus) => void
  setHasReceivedPlanResponse: (value: boolean) => void
  setIsRetrying: (value: boolean) => void
}

export interface SubagentCallbacks {
  addActiveSubagent: (id: string) => void
  removeActiveSubagent: (id: string) => void
}

export interface ExecuteMessageParams {
  /** Core message data */
  message: MessageData
  /** Streaming state and UI update context */
  streaming: StreamingContext
  /** SDK execution context */
  execution: ExecutionContext
  /** Callbacks for streaming state updates */
  streamingCallbacks: StreamingCallbacks
  /** Callbacks for subagent tracking */
  subagentCallbacks: SubagentCallbacks
  /** Callback for tracking total cost */
  onTotalCost?: (cost: number) => void
}

export interface ExecuteMessageResult {
  success: true
  runState: RunState
}

export interface ExecuteMessageError {
  success: false
  error: 'no_client' | 'execution_error'
  message?: string
  /** HTTP status code if the error was an HTTP error (e.g., 402 for out-of-credits) */
  statusCode?: number
}

export type ExecuteMessageOutcome = ExecuteMessageResult | ExecuteMessageError

export interface UseMessageExecutionOptions {
  /** Explicit agent ID to use (overrides mode-based selection) */
  agentId?: string
}

export interface UseMessageExecutionReturn {
  /** Execute a message and return the run state or error */
  executeMessage: (params: ExecuteMessageParams) => Promise<ExecuteMessageOutcome>
}

/**
 * Hook for executing messages via the SDK.
 * Encapsulates agent resolution, client acquisition, and run execution.
 */
export function useMessageExecution({
  agentId,
}: UseMessageExecutionOptions): UseMessageExecutionReturn {
  const executeMessage = useCallback(
    async (params: ExecuteMessageParams): Promise<ExecuteMessageOutcome> => {
      const {
        message,
        streaming,
        execution,
        streamingCallbacks,
        subagentCallbacks,
        onTotalCost,
      } = params

      // Destructure from grouped objects
      const { prompt, bashContext, messageContent, agentMode } = message
      const { aiMessageId, streamRefs, updater, hasReceivedContentRef } = streaming
      const { previousRunState, signal } = execution

      // Get SDK client
      const client = await getCodebuffClient()

      if (!client) {
        logger.error(
          {},
          '[message-execution] No Codebuff client available. Please ensure you are authenticated.',
        )
        return {
          success: false,
          error: 'no_client',
          message:
            'Unable to connect to Codebuff. Please check your authentication and try again.',
        }
      }

      // Resolve agent and build prompt
      const agentDefinitions = loadAgentDefinitions()
      const resolvedAgent = resolveAgent(agentMode, agentId, agentDefinitions)

      const promptWithBashContext = bashContext
        ? bashContext + prompt
        : prompt
      const effectivePrompt = buildPromptWithContext(
        promptWithBashContext,
        messageContent,
      )

      // Create event handler state
      const eventHandlerState = createEventHandlerState({
        streamRefs,
        setStreamingAgents: streamingCallbacks.setStreamingAgents,
        setStreamStatus: streamingCallbacks.setStreamStatus,
        aiMessageId,
        updater,
        hasReceivedContentRef,
        addActiveSubagent: subagentCallbacks.addActiveSubagent,
        removeActiveSubagent: subagentCallbacks.removeActiveSubagent,
        agentMode,
        setHasReceivedPlanResponse:
          streamingCallbacks.setHasReceivedPlanResponse,
        logger,
        setIsRetrying: streamingCallbacks.setIsRetrying,
        onTotalCost,
      })

      // Create run config
      const runConfig = createRunConfig({
        logger,
        agent: resolvedAgent,
        prompt: effectivePrompt,
        content: messageContent,
        previousRunState,
        agentDefinitions,
        eventHandlerState,
        signal,
      })

      logger.info({ runConfig }, '[message-execution] Executing SDK run')

      // Execute the run with error handling
      try {
        const runState = await client.run(runConfig)

        return {
          success: true,
          runState,
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown execution error'
        logger.error(
          { error },
          '[message-execution] SDK run execution failed',
        )

        // Preserve statusCode for out-of-credits detection (402)
        const statusCode =
          error &&
          typeof error === 'object' &&
          'statusCode' in error &&
          typeof (error as { statusCode: unknown }).statusCode === 'number'
            ? (error as { statusCode: number }).statusCode
            : undefined

        return {
          success: false,
          error: 'execution_error',
          message: errorMessage,
          statusCode,
        }
      }
    },
    [agentId],
  )

  return {
    executeMessage,
  }
}
