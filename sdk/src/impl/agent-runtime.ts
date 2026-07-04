import { trackEvent as trackCommonEvent } from '@codebirds/common/analytics'
import { env as clientEnvDefault } from '@codebirds/common/env'
import { getCiEnv } from '@codebirds/common/env-ci'
import { shouldTrackAnalyticsEvent } from '@codebirds/common/util/analytics-sampling'
import { success } from '@codebirds/common/util/error'

import {
  addAgentStep,
  fetchAgentFromDatabase,
  finishAgentRun,
  getUserInfoFromApiKey,
  startAgentRun,
} from './database'
import { promptAiSdk, promptAiSdkStream, promptAiSdkStructured } from './llm'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebirds/common/types/contracts/agent-runtime'
import type { AgentTemplate } from '@codebirds/common/types/agent-template'
import type { DatabaseAgentCache } from '@codebirds/common/types/contracts/database'
import type { ClientEnv } from '@codebirds/common/types/contracts/env'
import type { Logger } from '@codebirds/common/types/contracts/logger'
import type { TraceWriter } from '@codebirds/common/types/contracts/trace'
import type { TrackEventFn } from '@codebirds/common/types/contracts/analytics'

const DATABASE_AGENT_CACHE_MAX_ENTRIES = 200

/** Insertion-order (FIFO) eviction so the cache can't grow without bound in
 *  long-lived processes (e.g. the codebirds chat server, which runs the agent
 *  runtime in-process). Templates are large — prompts plus handleSteps source. */
class BoundedAgentCache extends Map<string, AgentTemplate | null> {
  override set(key: string, value: AgentTemplate | null): this {
    if (!this.has(key)) {
      while (this.size >= DATABASE_AGENT_CACHE_MAX_ENTRIES) {
        const oldestKey = this.keys().next().value
        if (oldestKey === undefined) break
        this.delete(oldestKey)
      }
    }
    return super.set(key, value)
  }
}

const databaseAgentCache: DatabaseAgentCache = new BoundedAgentCache()

export function getAgentRuntimeImpl(
  params: {
    logger?: Logger
    traceWriter?: TraceWriter
    apiKey: string
    clientEnv?: ClientEnv
  } & Pick<
    AgentRuntimeScopedDeps,
    | 'handleStepsLogChunk'
    | 'requestToolCall'
    | 'requestMcpToolData'
    | 'requestFiles'
    | 'requestOptionalFile'
    | 'sendAction'
    | 'sendSubagentChunk'
  >,
): AgentRuntimeDeps & AgentRuntimeScopedDeps {
  const {
    logger,
    traceWriter,
    apiKey,
    clientEnv = clientEnvDefault,
    handleStepsLogChunk,
    requestToolCall,
    requestMcpToolData,
    requestFiles,
    requestOptionalFile,
    sendAction,
    sendSubagentChunk,
  } = params

  const trackSdkRuntimeEvent: TrackEventFn = (eventParams) => {
    if (
      clientEnv.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod' &&
      !shouldTrackAnalyticsEvent({
        event: eventParams.event,
        distinctId: eventParams.userId,
        properties: eventParams.properties,
      })
    ) {
      return
    }

    trackCommonEvent(eventParams)
  }

  return {
    // Environment
    clientEnv,
    ciEnv: getCiEnv(),

    // Database
    getUserInfoFromApiKey,
    fetchAgentFromDatabase,
    startAgentRun,
    finishAgentRun,
    addAgentStep,

    // Billing
    consumeCreditsWithFallback: async () =>
      success({
        chargedToOrganization: false,
      }),

    // LLM
    promptAiSdkStream,
    promptAiSdk,
    promptAiSdkStructured,

    // Mutable State
    databaseAgentCache,

    // Analytics
    trackEvent: trackSdkRuntimeEvent,

    // Other
    logger: logger ?? noopLogger,
    traceWriter,
    fetch: globalThis.fetch,

    // Client (WebSocket)
    handleStepsLogChunk,
    requestToolCall,
    requestMcpToolData,
    requestFiles,
    requestOptionalFile,
    sendAction,
    sendSubagentChunk,

    apiKey,
  }
}

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}
