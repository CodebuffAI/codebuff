import {
  createEventHandler,
  createStreamChunkHandler,
} from './sdk-event-handlers'

import type { EventHandlerState } from './sdk-event-handlers'
import type { AgentDefinition, MessageContent, RunState } from '@codebuff/sdk'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export type CreateRunConfigParams = {
  logger: Logger
  agent: AgentDefinition | string
  prompt: string
  content: MessageContent[] | undefined
  previousRunState: RunState | null
  agentDefinitions: AgentDefinition[]
  eventHandlerState: EventHandlerState
}

export const createRunConfig = (params: CreateRunConfigParams) => {
  const {
    logger,
    agent,
    prompt,
    content,
    previousRunState,
    agentDefinitions,
    eventHandlerState,
  } = params

  return {
    logger,
    agent,
    prompt,
    content,
    previousRun: previousRunState ?? undefined,
    agentDefinitions,
    maxAgentSteps: 100,
    handleStreamChunk: createStreamChunkHandler(eventHandlerState),
    handleEvent: createEventHandler(eventHandlerState),
  }
}
