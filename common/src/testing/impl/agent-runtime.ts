import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'
import type { Logger } from '@codebuff/common/types/contracts/logger'

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
  // promptAiSdkStream: async function* () {
  //   throw new Error('promptAiSdkStream not implemented in test runtime')
  // },
}
