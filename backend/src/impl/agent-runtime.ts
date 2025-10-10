import { addAgentStep, finishAgentRun, startAgentRun } from '../agent-run'
import {
  promptAiSdk,
  promptAiSdkStream,
  promptAiSdkStructured,
} from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { fetchAgentFromDatabase } from '../templates/agent-registry'
import { logger } from '../util/logger'
import { getUserInfoFromApiKey } from '../websockets/auth'

import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'

export const BACKEND_AGENT_RUNTIME_IMPL: AgentRuntimeDeps = Object.freeze({
  // Database
  getUserInfoFromApiKey,
  fetchAgentFromDatabase,
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
