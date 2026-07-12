import {
  LOCAL_MODE_USER_EMAIL,
  LOCAL_MODE_USER_ID,
} from '@codebuff/common/constants/local-mode'
import { env as clientEnvDefault } from '@codebuff/common/env'
import { getCiEnv } from '@codebuff/common/env-ci'
import { success } from '@codebuff/common/util/error'

import { promptAiSdk, promptAiSdkStream, promptAiSdkStructured } from './llm'
import { resolveModelContextWindow } from './model-provider'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { DatabaseAgentCache } from '@codebuff/common/types/contracts/database'
import type { ClientEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type {
  AddAgentStepFn,
  FetchAgentFromDatabaseFn,
  FinishAgentRunFn,
  GetUserInfoFromApiKeyInput,
  GetUserInfoFromApiKeyFn,
  StartAgentRunFn,
  UserColumn,
} from '@codebuff/common/types/contracts/database'

const databaseAgentCache: DatabaseAgentCache = new Map()

export function getAgentRuntimeImpl(
  params: {
    logger?: Logger
    apiKey: string
    clientEnv?: ClientEnv
  } & Pick<
    AgentRuntimeScopedDeps,
    | 'handleStepsLogChunk'
    | 'requestToolCall'
    | 'requestMcpToolData'
    | 'requestFiles'
    | 'requestOptionalFile'
    | 'fileSystem'
    | 'fileFilter'
    | 'sendAction'
    | 'sendSubagentChunk'
  >,
): AgentRuntimeDeps & AgentRuntimeScopedDeps {
  const {
    logger,
    apiKey,
    clientEnv = clientEnvDefault,
    handleStepsLogChunk,
    requestToolCall,
    requestMcpToolData,
    requestFiles,
    requestOptionalFile,
    fileSystem,
    fileFilter,
    sendAction,
    sendSubagentChunk,
  } = params

  const trackSdkRuntimeEvent: TrackEventFn = () => {
    return
  }

  return {
    // Environment
    clientEnv,
    ciEnv: getCiEnv(),

    // Database
    getUserInfoFromApiKey: localGetUserInfoFromApiKey,
    fetchAgentFromDatabase: localFetchAgentFromDatabase,
    startAgentRun: localStartAgentRun,
    finishAgentRun: localFinishAgentRun,
    addAgentStep: localAddAgentStep,

    // Billing
    consumeCreditsWithFallback: async () =>
      success({
        chargedToOrganization: false,
      }),

    // LLM
    promptAiSdkStream,
    promptAiSdk,
    promptAiSdkStructured,
    resolveModelContextWindow,

    // Mutable State
    databaseAgentCache,

    // Analytics
    trackEvent: trackSdkRuntimeEvent,

    // Other
    logger: logger ?? noopLogger,
    fetch: globalThis.fetch,

    // Client (WebSocket)
    handleStepsLogChunk,
    requestToolCall,
    requestMcpToolData,
    requestFiles,
    requestOptionalFile,
    fileSystem,
    fileFilter,
    sendAction,
    sendSubagentChunk,

    apiKey,
  }
}

const localUser = {
  id: LOCAL_MODE_USER_ID,
  email: LOCAL_MODE_USER_EMAIL,
  discord_id: null,
  stripe_customer_id: null,
  banned: false,
  created_at: new Date(0),
}

const localGetUserInfoFromApiKey: GetUserInfoFromApiKeyFn = async <
  T extends UserColumn,
>({
  fields,
}: GetUserInfoFromApiKeyInput<T>) => {
  return Object.fromEntries(
    fields.map((field) => [field, localUser[field]]),
  ) as { [K in T]: (typeof localUser)[K] }
}

const localFetchAgentFromDatabase: FetchAgentFromDatabaseFn = async ({
  parsedAgentId,
  logger,
}) => {
  logger.debug(
    { parsedAgentId },
    'Local mode: skipping remote agent registry lookup',
  )
  return null
}

const localStartAgentRun: StartAgentRunFn = async () =>
  `local-run-${crypto.randomUUID()}`

const localFinishAgentRun: FinishAgentRunFn = async () => {}

const localAddAgentStep: AddAgentStepFn = async () =>
  `local-step-${crypto.randomUUID()}`

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}
