import {
  MAX_RETRIES_PER_MESSAGE,
  RETRY_BACKOFF_BASE_DELAY_MS,
  RETRY_BACKOFF_MAX_DELAY_MS,
} from '@codebuff/sdk'

import {
  createEventHandler,
  createStreamChunkHandler,
} from './sdk-event-handlers'

import type { EventHandlerState } from './sdk-event-handlers'
import type { AgentDefinition, MessageContent, RunState } from '@codebuff/sdk'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { StreamStatus } from '../hooks/use-message-queue'

export type CreateRunConfigParams = {
  logger: Logger
  agent: AgentDefinition | string
  prompt: string
  content: MessageContent[] | undefined
  previousRunState: RunState | null
  abortController: AbortController
  agentDefinitions: AgentDefinition[]
  eventHandlerState: EventHandlerState
  setIsRetrying: (retrying: boolean) => void
  setStreamStatus: (status: StreamStatus) => void
}

type RetryArgs = {
  attempt: number
  delayMs: number
  errorCode?: string
}

type RetryExhaustedArgs = {
  totalAttempts: number
  errorCode?: string
}

export const createRunConfig = (params: CreateRunConfigParams) => {
  const {
    logger,
    agent,
    prompt,
    content,
    previousRunState,
    abortController,
    agentDefinitions,
    eventHandlerState,
    setIsRetrying,
    setStreamStatus,
  } = params

  return {
    logger,
    agent,
    prompt,
    content,
    previousRun: previousRunState ?? undefined,
    abortController,
    retry: {
      maxRetries: MAX_RETRIES_PER_MESSAGE,
      backoffBaseMs: RETRY_BACKOFF_BASE_DELAY_MS,
      backoffMaxMs: RETRY_BACKOFF_MAX_DELAY_MS,
      onRetry: async ({ attempt, delayMs, errorCode }: RetryArgs) => {
        logger.warn(
          { sdkAttempt: attempt, delayMs, errorCode },
          'SDK retrying after error',
        )
        setIsRetrying(true)
        setStreamStatus('waiting')
      },
      onRetryExhausted: async ({
        totalAttempts,
        errorCode,
      }: RetryExhaustedArgs) => {
        logger.warn({ totalAttempts, errorCode }, 'SDK exhausted all retries')
      },
    },
    agentDefinitions,
    maxAgentSteps: 100,
    handleStreamChunk: createStreamChunkHandler(eventHandlerState),
    handleEvent: createEventHandler(eventHandlerState),
  }
}
