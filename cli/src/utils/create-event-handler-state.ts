import type { AgentMode } from './constants'
import type { MessageUpdater } from './message-updater'
import type {
  EventHandlerState,
  SetStreamingAgentsFn,
  SetStreamStatusFn,
} from './sdk-event-handlers'
import type { StreamController } from '../hooks/stream-state'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { MutableRefObject } from 'react'

export type CreateEventHandlerStateParams = {
  streamRefs: StreamController
  setStreamingAgents: SetStreamingAgentsFn
  setStreamStatus: SetStreamStatusFn
  aiMessageId: string
  updater: MessageUpdater
  hasReceivedContentRef: MutableRefObject<boolean>
  addActiveSubagent: (id: string) => void
  removeActiveSubagent: (id: string) => void
  agentMode: AgentMode
  setHasReceivedPlanResponse: (value: boolean) => void
  logger: Logger
  setIsRetrying: (retrying: boolean) => void
  onTotalCost?: (cost: number) => void
}

export const createEventHandlerState = (
  params: CreateEventHandlerStateParams,
): EventHandlerState => {
  const {
    streamRefs,
    setStreamingAgents,
    setStreamStatus,
    aiMessageId,
    updater,
    hasReceivedContentRef,
    addActiveSubagent,
    removeActiveSubagent,
    agentMode,
    setHasReceivedPlanResponse,
    logger,
    setIsRetrying,
    onTotalCost,
  } = params

  return {
    streaming: {
      streamRefs,
      setStreamingAgents,
      setStreamStatus,
    },
    message: {
      aiMessageId,
      updater,
      hasReceivedContentRef,
    },
    subagents: {
      addActiveSubagent,
      removeActiveSubagent,
    },
    mode: {
      agentMode,
      setHasReceivedPlanResponse,
    },
    logger,
    setIsRetrying,
    onTotalCost,
  }
}
