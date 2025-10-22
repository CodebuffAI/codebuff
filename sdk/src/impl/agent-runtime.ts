import { trackEvent } from '@codebuff/common/analytics'

import {
  fetchAgentFromDatabase,
  getUserInfoFromApiKey,
  startAgentRun,
} from './database'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'

export const CLI_AGENT_RUNTIME_IMPL: Omit<
  AgentRuntimeDeps & AgentRuntimeScopedDeps,
  | 'finishAgentRun'
  | 'addAgentStep'
  | 'consumeCreditsWithFallback'
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
  // finishAgentRun: FinishAgentRunFn
  // addAgentStep: AddAgentStepFn

  // Billing
  // consumeCreditsWithFallback: ConsumeCreditsWithFallbackFn,

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
