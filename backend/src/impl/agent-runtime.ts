import { consumeCreditsWithFallback } from '@codebuff/billing'
import { trackEvent } from '@codebuff/common/analytics'

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

  // Billing
  consumeCreditsWithFallback,

  // LLM
  promptAiSdkStream,
  promptAiSdk,
  promptAiSdkStructured,

  // Mutable State
  databaseAgentCache: new Map<string, AgentTemplate | null>(),
  liveUserInputRecord: {},
  sessionConnections: {},

  // Analytics
  trackEvent,

  // Other
  logger,
  fetch: globalThis.fetch,
})
