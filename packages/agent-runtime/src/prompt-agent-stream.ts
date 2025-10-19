import { providerModelNames } from '@codebuff/common/old-constants'

import { globalStopSequence } from './constants'

import type { AgentTemplate } from './templates/types'
import type { SendActionFn } from '@codebuff/common/types/contracts/client'
import type { PromptAiSdkStreamFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { OpenRouterProviderOptions } from '@codebuff/internal/openrouter-ai-sdk'

export const getAgentStreamFromTemplate = (params: {
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  onCostCalculated?: (credits: number) => Promise<void>
  agentId?: string
  includeCacheControl?: boolean

  template: AgentTemplate
  logger: Logger
  sendAction: SendActionFn
  promptAiSdkStream: PromptAiSdkStreamFn
}) => {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    onCostCalculated,
    agentId,
    includeCacheControl,
    template,
    logger,
    sendAction,
    promptAiSdkStream,
  } = params

  if (!template) {
    throw new Error('Agent template is null/undefined')
  }

  const { model } = template

  const getStream = (messages: Message[]) => {
    const aiSdkStreamParams: ParamsOf<PromptAiSdkStreamFn> = {
      messages,
      model,
      stopSequences: [globalStopSequence],
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
      logger,
    }

    // Add Gemini-specific options if needed
    const primaryModel = Array.isArray(model) ? model[0] : model
    const provider =
      providerModelNames[primaryModel as keyof typeof providerModelNames]

    if (!aiSdkStreamParams.providerOptions) {
      aiSdkStreamParams.providerOptions = {}
    }
    if (!aiSdkStreamParams.providerOptions.openrouter) {
      aiSdkStreamParams.providerOptions.openrouter = {}
    }
    ;(
      aiSdkStreamParams.providerOptions.openrouter as OpenRouterProviderOptions
    ).reasoning = template.reasoningOptions

    return promptAiSdkStream(aiSdkStreamParams)
  }

  return { getStream }
}
