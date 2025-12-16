import { success } from '@codebuff/common/util/error'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'
import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'

const evalsClientEnv: ClientEnv = {
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

const evalsCiEnv: CiEnv = {
  CI: 'true',
  GITHUB_ACTIONS: undefined,
  RENDER: undefined,
  IS_PULL_REQUEST: undefined,
  CODEBUFF_GITHUB_TOKEN: undefined,
  CODEBUFF_API_KEY: 'eval-api-key',
  EVAL_RESULTS_EMAIL: undefined,
}

export const EVALS_AGENT_RUNTIME_IMPL = Object.freeze<AgentRuntimeDeps>({
  // Environment
  clientEnv: evalsClientEnv,
  ciEnv: evalsCiEnv,

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

  // Backend
  consumeCreditsWithFallback: async () => {
    return success({
      chargedToOrganization: false,
    })
  },

  // LLM
  promptAiSdkStream: async function* () {
    throw new Error('promptAiSdkStream not implemented in eval runtime')
  },
  promptAiSdk: async function () {
    throw new Error('promptAiSdk not implemented in eval runtime')
  },
  promptAiSdkStructured: async function () {
    throw new Error('promptAiSdkStructured not implemented in eval runtime')
  },

  // Mutable State
  liveUserInputRecord: {},
  sessionConnections: {},
  databaseAgentCache: new Map<string, AgentTemplate | null>(),

  // Analytics
  trackEvent: () => {},

  // Other
  logger: console,
  fetch: globalThis.fetch,
})
