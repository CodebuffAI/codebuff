import type { AgentRuntimeDeps } from '@codebuff/types/deps/agent-runtime'
import type { Logger } from '@codebuff/types/logger'

export const testLogger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

export const testAgentRuntimeImpl: AgentRuntimeDeps = {
  logger: testLogger,

  startAgentRun: async () => 'test-agent-run-id',
  finishAgentRun: async () => {},
  addAgentStep: async () => 'test-agent-step-id',
}
