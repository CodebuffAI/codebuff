import { trackEvent } from '@codebuff/common/analytics'
import { success } from '@codebuff/common/util/error'

import {
  addAgentStep,
  fetchAgentFromDatabase,
  finishAgentRun,
  getUserInfoFromApiKey,
  startAgentRun,
} from './database'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export function getAgentRuntimeImpl(params: {
  logger?: Logger
  apiKey: string
}): Omit<
  AgentRuntimeDeps & AgentRuntimeScopedDeps,
  | 'promptAiSdkStream'
  | 'promptAiSdk'
  | 'promptAiSdkStructured'
  | 'handleStepsLogChunk'
  | 'requestToolCall'
  | 'requestMcpToolData'
  | 'requestFiles'
  | 'requestOptionalFile'
  | 'sendAction'
  | 'sendSubagentChunk'
> {
  const { logger, apiKey } = params

  return {
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
    // promptAiSdkStream: PromptAiSdkStreamFn,
    // promptAiSdk: PromptAiSdkFn,
    // promptAiSdkStructured: PromptAiSdkStructuredFn,

    // Mutable State
    databaseAgentCache: new Map(),
    liveUserInputRecord: {},
    sessionConnections: {},

    // Analytics
    trackEvent,

    // Other
    logger: logger ?? {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    },
    fetch: globalThis.fetch,

    // Client (WebSocket)
    // handleStepsLogChunk: HandleStepsLogChunkFn,
    // requestToolCall: RequestToolCallFn,
    // requestMcpToolData: RequestMcpToolDataFn,
    // requestFiles: RequestFilesFn,
    // requestOptionalFile: RequestOptionalFileFn,
    // sendAction: SendActionFn,
    // sendSubagentChunk: SendSubagentChunkFn,

    apiKey,
  }
}
