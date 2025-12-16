/**
 * Test-only AgentRuntime dependency fixture.
 *
 * This file intentionally hardcodes dummy values (e.g. API keys) for tests.
 * Do not import from production code.
 */

import type { AgentTemplate } from '../../types/agent-template'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '../../types/contracts/agent-runtime'
import type { ClientEnv, CiEnv } from '../../types/contracts/env'
import type { Logger } from '../../types/contracts/logger'

export const testLogger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

export const testFetch = async () => {
  throw new Error('fetch not implemented in test runtime')
}
testFetch.preconnect = async () => {
  throw new Error('fetch.preconnect not implemented in test runtime')
}

export const testClientEnv: ClientEnv = {
  NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
  NEXT_PUBLIC_CODEBUFF_APP_URL: 'https://test.codebuff.com',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'support@codebuff.test',
  NEXT_PUBLIC_POSTHOG_API_KEY: 'test-posthog-key',
  NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://test.posthog.com',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
  NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: 'https://test.stripe.com/portal',
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID: undefined,
  NEXT_PUBLIC_WEB_PORT: 3000,
}

export const testCiEnv: CiEnv = {
  CI: undefined,
  GITHUB_ACTIONS: undefined,
  RENDER: undefined,
  IS_PULL_REQUEST: undefined,
  CODEBUFF_GITHUB_TOKEN: undefined,
  CODEBUFF_API_KEY: 'test-api-key',
}

export const TEST_AGENT_RUNTIME_IMPL = Object.freeze<
  AgentRuntimeDeps & AgentRuntimeScopedDeps
>({
  // Environment
  clientEnv: testClientEnv,
  ciEnv: testCiEnv,

  // Database
  getUserInfoFromApiKey: async () => ({
    id: 'test-user-id',
    email: 'test-email',
    discord_id: 'test-discord-id',
    referral_code: 'ref-test-code',
    banned: false,
  }),
  fetchAgentFromDatabase: async () => null,
  startAgentRun: async () => 'test-agent-run-id',
  finishAgentRun: async () => {},
  addAgentStep: async () => 'test-agent-step-id',

  // Billing
  consumeCreditsWithFallback: async () => {
    throw new Error(
      'consumeCreditsWithFallback not implemented in test runtime',
    )
  },

  // LLM
  promptAiSdkStream: async function* () {
    throw new Error('promptAiSdkStream not implemented in test runtime')
  },
  promptAiSdk: async function () {
    throw new Error('promptAiSdk not implemented in test runtime')
  },
  promptAiSdkStructured: async function () {
    throw new Error('promptAiSdkStructured not implemented in test runtime')
  },

  // Mutable State
  databaseAgentCache: new Map<string, AgentTemplate | null>(),
  liveUserInputRecord: {},
  sessionConnections: {},

  // Analytics
  trackEvent: () => {},

  // Other
  logger: testLogger,
  fetch: testFetch,

  // Scoped deps

  // Database
  handleStepsLogChunk: () => {
    throw new Error('handleStepsLogChunk not implemented in test runtime')
  },
  requestToolCall: () => {
    throw new Error('requestToolCall not implemented in test runtime')
  },
  requestMcpToolData: () => {
    throw new Error('requestMcpToolData not implemented in test runtime')
  },
  requestFiles: () => {
    throw new Error('requestFiles not implemented in test runtime')
  },
  requestOptionalFile: () => {
    throw new Error('requestOptionalFile not implemented in test runtime')
  },
  sendSubagentChunk: () => {
    throw new Error('sendSubagentChunk not implemented in test runtime')
  },
  sendAction: () => {
    throw new Error('sendAction not implemented in test runtime')
  },

  apiKey: 'test-api-key',
})

