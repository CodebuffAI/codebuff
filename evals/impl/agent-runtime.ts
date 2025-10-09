import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'

export const evalAgentRuntimeImpl: AgentRuntimeDeps = {
  logger: console,

  startAgentRun: async () => 'test-agent-run-id',
  finishAgentRun: async () => {},
  addAgentStep: async () => 'test-agent-step-id',
  // promptAiSdkStream: async function* () {
  //   throw new Error('promptAiSdkStream not implemented in eval runtime')
  // },
}
