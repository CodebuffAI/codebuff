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
  databaseAgentCache: new Map<string, AgentTemplate | null>(),

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

  // Other
  logger: console,
})
