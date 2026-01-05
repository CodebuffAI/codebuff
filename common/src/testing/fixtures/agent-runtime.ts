/**
 * Test-only AgentRuntime dependency fixture.
 *
 * This file intentionally hardcodes dummy values (e.g. API keys) for tests.
 * Do not import from production code.
 */

import { getInitialAgentState } from '../../types/session-state'

import type { AgentTemplate } from '../../types/agent-template'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '../../types/contracts/agent-runtime'
import type { GetUserInfoFromApiKeyInput, UserColumn } from '../../types/contracts/database'
import type { ClientEnv, CiEnv } from '../../types/contracts/env'
import type { Logger } from '../../types/contracts/logger'
import type { PrintModeEvent } from '../../types/print-mode'
import type { AgentState } from '../../types/session-state'
import type { ProjectFileContext } from '../../util/file'
import type { ToolSet } from 'ai'

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
  getUserInfoFromApiKey: async <T extends UserColumn>({
    fields,
  }: GetUserInfoFromApiKeyInput<T>) => {
    const user = {
      id: 'test-user-id',
      email: 'test-email',
      discord_id: 'test-discord-id',
      referral_code: 'ref-test-code',
      stripe_customer_id: null,
      banned: false,
    } as const

    return Object.fromEntries(fields.map((field) => [field, user[field]])) as {
      [K in T]: (typeof user)[K]
    }
  },
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

/**
 * Mock file context for tests
 */
export const testFileContext: ProjectFileContext = {
  projectRoot: '/test',
  cwd: '/test',
  fileTree: [],
  fileTokenScores: {},
  knowledgeFiles: {},
  userKnowledgeFiles: {},
  agentTemplates: {},
  customToolDefinitions: {},
  gitChanges: {
    status: '',
    diff: '',
    diffCached: '',
    lastCommitMessages: '',
  },
  changesSinceLastChat: {},
  shellConfigFiles: {},
  systemInfo: {
    platform: 'test',
    shell: 'test',
    nodeVersion: 'test',
    arch: 'test',
    homedir: '/home/test',
    cpus: 1,
  },
}

/**
 * Mock agent template for tests
 */
export const testAgentTemplate: AgentTemplate = {
  id: 'test-agent',
  displayName: 'Test Agent',
  spawnerPrompt: 'Testing',
  model: 'claude-3-5-sonnet-20241022',
  inputSchema: {},
  outputMode: 'last_message',
  includeMessageHistory: true,
  inheritParentSystemPrompt: false,
  mcpServers: {},
  toolNames: ['read_files', 'write_file', 'end_turn'],
  spawnableAgents: [],
  systemPrompt: 'Test system prompt',
  instructionsPrompt: 'Test user prompt',
  stepPrompt: 'Test agent step prompt',
}

/**
 * Extended test params that include all commonly needed properties for
 * testing agent runtime functions like loopAgentSteps and handleSpawnAgents.
 *
 * This type extends AgentRuntimeDeps & AgentRuntimeScopedDeps with additional
 * properties that are frequently required in tests.
 */
export type TestAgentRuntimeParams = AgentRuntimeDeps &
  AgentRuntimeScopedDeps & {
    // Identifiers
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    repoId: string | undefined
    repoUrl: string | undefined
    runId: string

    // Agent configuration
    agentState: AgentState
    agentTemplate: AgentTemplate
    localAgentTemplates: Record<string, AgentTemplate>
    ancestorRunIds: string[]

    // Context
    fileContext: ProjectFileContext
    system: string
    tools: ToolSet
    prompt: string | undefined
    spawnParams: Record<string, any> | undefined

    // Control
    signal: AbortSignal
    previousToolCallFinished: Promise<void>

    // Callbacks
    onResponseChunk: (chunk: string | PrintModeEvent) => void
    writeToClient: (chunk: string | PrintModeEvent) => void
  }

/**
 * Creates a complete test params object that includes all commonly needed properties.
 * Use this when calling functions like loopAgentSteps, handleSpawnAgents, etc.
 *
 * @param overrides - Optional overrides for any properties
 * @returns Complete test params object
 */
export function createTestAgentRuntimeParams(
  overrides: Partial<TestAgentRuntimeParams> = {},
): TestAgentRuntimeParams {
  const agentState = overrides.agentState ?? getInitialAgentState()

  return {
    // Include all base runtime deps
    ...TEST_AGENT_RUNTIME_IMPL,

    // Identifiers
    clientSessionId: 'test-session',
    fingerprintId: 'test-fingerprint',
    userInputId: 'test-input',
    userId: 'test-user',
    repoId: undefined,
    repoUrl: undefined,
    runId: 'test-run-id',

    // Agent configuration
    agentState,
    agentTemplate: testAgentTemplate,
    localAgentTemplates: { 'test-agent': testAgentTemplate },
    ancestorRunIds: [],

    // Context
    fileContext: testFileContext,
    system: 'Test system prompt',
    tools: {},
    prompt: undefined,
    spawnParams: undefined,

    // Control
    signal: new AbortController().signal,
    previousToolCallFinished: Promise.resolve(),

    // Callbacks
    onResponseChunk: () => {},
    writeToClient: () => {},

    // Apply overrides last
    ...overrides,
  }
}
