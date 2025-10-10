import { addAgentStep, finishAgentRun, startAgentRun } from '../agent-run'
import {
  promptAiSdk,
  promptAiSdkStream,
  promptAiSdkStructured,
} from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { logger } from '../util/logger'

import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'

export const BACKEND_AGENT_RUNTIME_IMPL: AgentRuntimeDeps = Object.freeze({
  // Database
  startAgentRun,
  finishAgentRun,
  addAgentStep,

  // LLM
  promptAiSdkStream,
  promptAiSdk,
  promptAiSdkStructured,

  // Other
  logger,
})
