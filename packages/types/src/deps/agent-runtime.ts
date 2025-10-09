import type { StartAgentRunFn } from '../database'
import type { Logger } from '../logger'

export type AgentRuntimeDeps = {
  logger: Logger

  startAgentRun: StartAgentRunFn
}
