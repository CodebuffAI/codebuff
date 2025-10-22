import { trackEvent } from '@codebuff/common/analytics'
import { success } from '@codebuff/common/util/error'

import {
  fetchAgentFromDatabase,
  finishAgentRun,
  getUserInfoFromApiKey,
  startAgentRun,
} from './database'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'

export const CLI_AGENT_RUNTIME_IMPL: Omit<
  AgentRuntimeDeps & AgentRuntimeScopedDeps,
  | 'addAgentStep'
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
> = {
  // Database
  getUserInfoFromApiKey,
  fetchAgentFromDatabase,
  startAgentRun,
  finishAgentRun,
  // addAgentStep: AddAgentStepFn

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
  logger: {
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

  apiKey: process.env.CODEBUFF_API_KEY ?? '',
}
