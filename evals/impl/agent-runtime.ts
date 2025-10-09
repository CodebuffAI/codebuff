import type { AgentRuntimeDeps } from '@codebuff/types/deps/agent-runtime'

export const evalAgentRuntimeImpl: AgentRuntimeDeps = {
  logger: console,

  startAgentRun: async () => 'test-agent-run-id',
  finishAgentRun: async () => {},
  addAgentStep: async () => 'test-agent-step-id',
}
