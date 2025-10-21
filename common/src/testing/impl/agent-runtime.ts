import { success } from '../../util/error'

import type { AgentTemplate } from '../../types/agent-template'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '../../types/contracts/agent-runtime'
import type { Logger } from '../../types/contracts/logger'

export const testLogger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

export const testFetch = async () => {
  throw new Error('fetch not implemented in test runtime')
}
testFetch.preconnect = async () => {
  throw new Error('fetch.preconnect not implemented in test runtime')
}

export const TEST_AGENT_RUNTIME_IMPL = Object.freeze<AgentRuntimeDeps>({
  // Database
  getUserInfoFromApiKey: async () => ({
    id: 'test-user-id',
    email: 'test-email',
    discord_id: 'test-discord-id',
  }),
  fetchAgentFromDatabase: async () => null,
  startAgentRun: async () => 'test-agent-run-id',
  finishAgentRun: async () => {},
  addAgentStep: async () => 'test-agent-step-id',

  // Billing
  consumeCreditsWithFallback: async () =>
    success({
      chargedToOrganization: false,
    }),

  // LLM
  promptAiSdkStream: async function* () {
    throw new Error('promptAiSdkStream not implemented in test runtime')
  },
  promptAiSdk: async function () {
    throw new Error('promptAiSdk not implemented in test runtime')
  },
  promptAiSdkStructured: async function () {
    throw new Error('promptAiSdkStructured not implemented in test runtime')
  },

  // Mutable State
  databaseAgentCache: new Map<string, AgentTemplate | null>(),
  liveUserInputRecord: {},
  sessionConnections: {},

  // Analytics
  trackEvent: () => {},

  // Other
  logger: testLogger,
  fetch: testFetch,
})

export const TEST_AGENT_RUNTIME_SCOPED_IMPL =
  Object.freeze<AgentRuntimeScopedDeps>({
    // Database
    handleStepsLogChunk: () => {
      throw new Error('handleStepsLogChunk not implemented in test runtime')
    },
    requestToolCall: () => {
      throw new Error('requestToolCall not implemented in test runtime')
    },
    requestMcpToolData: () => {
      throw new Error('requestMcpToolData not implemented in test runtime')
    },
    requestFiles: () => {
      throw new Error('requestFiles not implemented in test runtime')
    },
    requestOptionalFile: () => {
      throw new Error('requestOptionalFile not implemented in test runtime')
    },
    sendSubagentChunk: () => {
      throw new Error('sendSubagentChunk not implemented in test runtime')
    },
    sendAction: () => {
      throw new Error('sendAction not implemented in test runtime')
    },
  })
