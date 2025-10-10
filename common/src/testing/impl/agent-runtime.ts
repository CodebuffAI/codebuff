import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const testLogger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

export const TEST_AGENT_RUNTIME_IMPL: AgentRuntimeDeps = Object.freeze({
  // Database
  getUserInfoFromApiKey: async () => ({
    id: 'test-user-id',
    email: 'test-email',
    discord_id: 'test-discord-id',
  }),
  startAgentRun: async () => 'test-agent-run-id',
  finishAgentRun: async () => {},
  addAgentStep: async () => 'test-agent-step-id',

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

  // Other
  logger: testLogger,
})
