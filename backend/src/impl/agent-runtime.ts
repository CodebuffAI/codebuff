import { addAgentStep, finishAgentRun, startAgentRun } from '../agent-run'
import { logger } from '../util/logger'

import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'

export const backendAgentRuntimeImpl: AgentRuntimeDeps = {
  logger,

  startAgentRun,
  finishAgentRun,
  addAgentStep,
  // promptAiSdkStream,
}
