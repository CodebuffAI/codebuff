import { addAgentStep, finishAgentRun, startAgentRun } from '../agent-run'
import {
  promptAiSdk,
  promptAiSdkStream,
  promptAiSdkStructured,
} from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { fetchAgentFromDatabase } from '../templates/agent-db'
import { logger } from '../util/logger'
import { getUserInfoFromApiKey } from '../websockets/auth'

import type { AgentTemplate } from '@codebuff/agent-runtime/templates/types'
import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'

export const BACKEND_AGENT_RUNTIME_IMPL: AgentRuntimeDeps = Object.freeze({
  // Database
  getUserInfoFromApiKey,
  fetchAgentFromDatabase,
  startAgentRun,
  finishAgentRun,
  addAgentStep,
  databaseAgentCache: new Map<string, AgentTemplate | null>(),

  // LLM
  promptAiSdkStream,
  promptAiSdk,
  promptAiSdkStructured,

  // Other
  logger,
})
