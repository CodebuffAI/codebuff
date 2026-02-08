import { trackEvent } from '@codebuff/common/analytics'
import { BYOK_LOCAL_API_KEY } from '@codebuff/common/constants/byok'
import { env as clientEnvDefault } from '@codebuff/common/env'
import { getCiEnv } from '@codebuff/common/env-ci'
import { success } from '@codebuff/common/util/error'

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
} from '@codebuff/common/types/contracts/agent-runtime'
import type { DatabaseAgentCache } from '@codebuff/common/types/contracts/database'
import type { ClientEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const databaseAgentCache: DatabaseAgentCache = new Map()

export function getAgentRuntimeImpl(
  params: {
    logger?: Logger
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

  return {
    // Environment
    clientEnv,
    ciEnv: getCiEnv(),

    // Database (no-op when BYOK-only mode to avoid failing backend requests with retries)
    getUserInfoFromApiKey: apiKey === BYOK_LOCAL_API_KEY
      ? async () => null
      : getUserInfoFromApiKey,
    fetchAgentFromDatabase: apiKey === BYOK_LOCAL_API_KEY
      ? async () => null
      : fetchAgentFromDatabase,
    startAgentRun: apiKey === BYOK_LOCAL_API_KEY
      ? async () => `byok-${crypto.randomUUID()}`
      : startAgentRun,
    finishAgentRun: apiKey === BYOK_LOCAL_API_KEY
      ? async () => {}
      : finishAgentRun,
    addAgentStep: apiKey === BYOK_LOCAL_API_KEY
      ? async () => `byok-step-${crypto.randomUUID()}`
      : addAgentStep,

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
    trackEvent,

    // Other
    logger: logger ?? noopLogger,
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