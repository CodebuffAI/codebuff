import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'

export const EVALS_AGENT_RUNTIME_IMPL: AgentRuntimeDeps = Object.freeze({
  logger: console,

  startAgentRun: async () => 'test-agent-run-id',
  finishAgentRun: async () => {},
  addAgentStep: async () => 'test-agent-step-id',

  promptAiSdkStream: async function* () {
    throw new Error('promptAiSdkStream not implemented in eval runtime')
  },
})
