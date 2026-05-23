import { globalStopSequence } from './constants'

import type { AgentTemplate } from './templates/types'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { SendActionFn } from '@codebuff/common/types/contracts/client'
import type { CacheDebugUsageData, PromptAiSdkStreamFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { OpenRouterProviderOptions } from '@codebuff/internal/openrouter-ai-sdk'
import type { ToolSet } from 'ai'

function isEditorProposalImplementor(agentId: string): boolean {
  return /^editor-implementor-proposal-\d+$/.test(agentId)
}

export const getAgentStreamFromTemplate = (params: {
  agentId?: string
  apiKey: string
  clientSessionId: string
  costMode?: string
  extraCodebuffMetadata?: Record<string, string>
  fingerprintId: string
  includeCacheControl?: boolean
  localAgentTemplates: Record<string, AgentTemplate>
  localMode?: boolean
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
    extraCodebuffMetadata,
    fingerprintId,
    includeCacheControl,
    localAgentTemplates,
    localMode,
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
  const resolvedAgentId = agentId ?? template.id
  const isProposalAgent = isEditorProposalImplementor(resolvedAgentId)

  const aiSdkStreamParams: ParamsOf<PromptAiSdkStreamFn> = {
    agentId: resolvedAgentId,
    apiKey,
    clientSessionId,
    costMode,
    extraCodebuffMetadata,
    fingerprintId,
    includeCacheControl,
    logger,
    localAgentTemplates,
    localMode,
    // Proposal agents only need to emit edit tool calls. Bounding output keeps
    // local/OpenAI-compatible proposal streams from running indefinitely.
    maxOutputTokens: isProposalAgent ? 32_000 : undefined,
    maxRetries: 3,
    messages,
    model,
    runId,
    signal: params.signal,
    spawnableAgents: template.spawnableAgents,
    stopSequences: [globalStopSequence],
    // Proposal agents are useless unless the model emits at least one edit
    // proposal. Ask tool-capable providers to require a tool call; provider
    // compatibility downgrades this for APIs that reject `required`.
    toolChoice: isProposalAgent ? 'required' : undefined,
    // Keep native tool schemas available. The XML parser remains a fallback for
    // models that print <codebuff_tool_call> blocks, but hiding native schemas
    // makes many OpenAI-compatible models answer in prose and produce no usable
    // proposal at all.
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
  for (const provider of ['openrouter', 'codebuff'] as const) {
    if (!aiSdkStreamParams.providerOptions[provider]) {
      aiSdkStreamParams.providerOptions[provider] = {}
    }
    ;(
      aiSdkStreamParams.providerOptions[provider] as OpenRouterProviderOptions
    ).reasoning = template.reasoningOptions
  }

  if (template.reasoningOptions && 'effort' in template.reasoningOptions) {
    for (const provider of ['openaiCompatible', 'openai'] as const) {
      aiSdkStreamParams.providerOptions[provider] = {
        ...(aiSdkStreamParams.providerOptions[provider] ?? {}),
        reasoningEffort: template.reasoningOptions.effort,
      }
    }
  }

  // Pass agent's provider routing options to SDK
  aiSdkStreamParams.agentProviderOptions = template.providerOptions

  return promptAiSdkStream(aiSdkStreamParams)
}
