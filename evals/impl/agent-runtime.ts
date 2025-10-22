import { success } from '@codebuff/common/util/error'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'

export const EVALS_AGENT_RUNTIME_IMPL = Object.freeze<AgentRuntimeDeps>({
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

  // Backend
  consumeCreditsWithFallback: async () => {
    return success({
      chargedToOrganization: false,
    })
  },

  // LLM
  promptAiSdkStream: async function* () {
    throw new Error('promptAiSdkStream not implemented in eval runtime')
  },
  promptAiSdk: async function () {
    throw new Error('promptAiSdk not implemented in eval runtime')
  },
  promptAiSdkStructured: async function () {
    throw new Error('promptAiSdkStructured not implemented in eval runtime')
  },

  // Mutable State
  liveUserInputRecord: {},
  sessionConnections: {},
  databaseAgentCache: new Map<string, AgentTemplate | null>(),

  // Analytics
  trackEvent: () => {},

  // Other
  logger: console,
  fetch: globalThis.fetch,
})
