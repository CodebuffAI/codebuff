import { addAgentStep, finishAgentRun, startAgentRun } from '../agent-run'
import { promptAiSdkStream } from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { logger } from '../util/logger'

import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'

export const BACKEND_AGENT_RUNTIME_IMPL: AgentRuntimeDeps = Object.freeze({
  logger,

  startAgentRun,
  finishAgentRun,
  addAgentStep,

  promptAiSdkStream,
})
