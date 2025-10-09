import { finishAgentRun, startAgentRun } from '../agent-run'
import { logger } from '../util/logger'

import type { AgentRuntimeDeps } from '@codebuff/types/deps/agent-runtime'

export const backendAgentRuntimeImpl: AgentRuntimeDeps = {
  logger,

  startAgentRun,
  finishAgentRun,
}
