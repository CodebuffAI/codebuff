import type { AgentTemplate } from './templates/types'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { SendActionFn } from '@codebuff/common/types/contracts/client'
import type {
  SessionRecord,
  UserInputRecord,
} from '@codebuff/common/types/contracts/live-user-input'
import type { PromptAiSdkStreamFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { OpenRouterProviderOptions } from '@codebuff/internal/openrouter-ai-sdk'
import type { ToolSet } from 'ai'

export const getAgentStreamFromTemplate = (params: {
  apiKey: string
  runId: string
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  onCostCalculated?: (credits: number) => Promise<void>
  agentId?: string
  includeCacheControl?: boolean
  textOverride: string | null

  template: AgentTemplate
  logger: Logger
  sendAction: SendActionFn
  promptAiSdkStream: PromptAiSdkStreamFn
  liveUserInputRecord: UserInputRecord
  sessionConnections: SessionRecord
  trackEvent: TrackEventFn
  messages: Message[]
  tools: ToolSet | undefined
}): ReturnType<PromptAiSdkStreamFn> => {
  const {
    apiKey,
    runId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    onCostCalculated,
    agentId,
    includeCacheControl,
    textOverride,
    template,
    logger,
    sendAction,
    promptAiSdkStream,
    liveUserInputRecord,
    sessionConnections,
    trackEvent,
    messages,
    tools,
  } = params

  if (textOverride !== null) {
    async function* stream(): ReturnType<PromptAiSdkStreamFn> {
      yield { type: 'text', text: textOverride!, agentId }
      return crypto.randomUUID()
    }
    return stream()
  }

  if (!template) {
    throw new Error('Agent template is null/undefined')
  }

  const { model } = template

  const aiSdkStreamParams: ParamsOf<PromptAiSdkStreamFn> = {
    apiKey,
    runId,
    messages,
    model,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    maxOutputTokens: 32_000,
    onCostCalculated,
    includeCacheControl,
    agentId,
    maxRetries: 3,
    sendAction,
    liveUserInputRecord,
    sessionConnections,
    logger,
    trackEvent,
    tools,
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

  // Pass agent's provider routing options to SDK
  aiSdkStreamParams.agentProviderOptions = template.providerOptions

  return promptAiSdkStream(aiSdkStreamParams)
}
