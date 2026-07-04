import { globalStopSequence } from './constants'

import type { AgentTemplate } from './templates/types'
import type { TrackEventFn } from '@codebirds/common/types/contracts/analytics'
import type { SendActionFn } from '@codebirds/common/types/contracts/client'
import type {
  CacheDebugUsageData,
  PromptAiSdkStreamFn,
} from '@codebirds/common/types/contracts/llm'
import type { Logger } from '@codebirds/common/types/contracts/logger'
import type { ParamsOf } from '@codebirds/common/types/function-params'
import type { Message } from '@codebirds/common/types/messages/codebirds-message'
import type { OpenRouterProviderOptions } from '@codebirds/common/types/agent-template'
import type { ToolSet } from 'ai'

export const getAgentStreamFromTemplate = (params: {
  agentId?: string
  apiKey: string
  clientSessionId: string
  costMode?: string
  extraCodebirdsMetadata?: Record<string, string>
  fingerprintId: string
  includeCacheControl?: boolean
  localAgentTemplates: Record<string, AgentTemplate>
  logger: Logger
  messages: Message[]
  runId: string
  signal: AbortSignal
  template: AgentTemplate
  tools: ToolSet
  userId: string | undefined
  userInputId: string
  cacheDebugCorrelation?: string
  onCacheDebugProviderRequestBuilt?: (params: {
    provider: string
    rawBody: unknown
    normalizedBody?: unknown
  }) => void
  onCacheDebugUsageReceived?: (usage: CacheDebugUsageData) => void

  onCostCalculated?: (credits: number) => Promise<void>
  promptAiSdkStream: PromptAiSdkStreamFn
  sendAction: SendActionFn
  trackEvent: TrackEventFn
}): ReturnType<PromptAiSdkStreamFn> => {
  const {
    agentId,
    apiKey,
    clientSessionId,
    costMode,
    extraCodebirdsMetadata,
    fingerprintId,
    includeCacheControl,
    localAgentTemplates,
    logger,
    messages,
    runId,
    template,
    tools,
    userId,
    userInputId,
    cacheDebugCorrelation,
    onCacheDebugProviderRequestBuilt,
    onCacheDebugUsageReceived,

    sendAction,
    onCostCalculated,
    promptAiSdkStream,
    trackEvent,
  } = params

  if (!template) {
    throw new Error('Agent template is null/undefined')
  }

  const { model } = template

  const aiSdkStreamParams: ParamsOf<PromptAiSdkStreamFn> = {
    agentId,
    apiKey,
    clientSessionId,
    costMode,
    extraCodebirdsMetadata,
    fingerprintId,
    includeCacheControl,
    logger,
    localAgentTemplates,
    maxOutputTokens: undefined,
    maxRetries: 3,
    messages,
    model,
    runId,
    signal: params.signal,
    spawnableAgents: template.spawnableAgents,
    stopSequences: [globalStopSequence],
    tools,
    userId,
    userInputId,
    cacheDebugCorrelation,
    onCacheDebugProviderRequestBuilt,
    onCacheDebugUsageReceived,

    onCostCalculated,
    sendAction,
    trackEvent,
  }

  if (!aiSdkStreamParams.providerOptions) {
    aiSdkStreamParams.providerOptions = {}
  }
  for (const provider of ['openrouter', 'codebirds'] as const) {
    if (!aiSdkStreamParams.providerOptions[provider]) {
      aiSdkStreamParams.providerOptions[provider] = {}
    }
    ;(
      aiSdkStreamParams.providerOptions[provider] as OpenRouterProviderOptions
    ).reasoning = template.reasoningOptions
  }

  // Pass agent's provider routing options to SDK
  aiSdkStreamParams.agentProviderOptions = template.providerOptions

  return promptAiSdkStream(aiSdkStreamParams)
}
