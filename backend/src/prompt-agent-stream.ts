import { CoreMessage } from 'ai'
import {
  AnthropicModel,
  CostMode,
  getModelForMode,
  Model, // Import Model type
  providerModelNames,
  shortModelNames,
} from 'common/constants'

import {
  promptAiSdkStream,
  transformMessages,
} from './llm-apis/vercel-ai-sdk/ai-sdk'

export const getAgentStream = (options: {
  costMode: CostMode
  selectedModel: string | undefined
  stopSequences: string[]
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  orgId?: string | null // Add orgId
  repoUrl?: string | null // Add repoUrl
}) => {
  const {
    costMode,
    selectedModel,
    stopSequences,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    orgId, 
    repoUrl, 
  } = options
  let chargeUser = true // Moved chargeUser initialization up

  if (selectedModel && !(selectedModel in shortModelNames)) {
    throw new Error(
      `Unknown model: ${selectedModel}. Please use a valid model. Valid models are: ${Object.keys(
        shortModelNames
      ).join(', ')}`
    )
  }

  const fullSelectedModel = selectedModel
    ? shortModelNames[selectedModel as keyof typeof shortModelNames]
    : undefined

  const model: Model = fullSelectedModel ?? getModelForMode(costMode, 'agent') // Ensure model is of type Model

  const provider = providerModelNames[model as keyof typeof providerModelNames]

  const getStream = (messages: CoreMessage[]) => {
    const options: Parameters<typeof promptAiSdkStream>[0] = {
      messages,
      model: model as AnthropicModel,
      stopSequences,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      maxTokens: 32_000,
    }

    if (provider === 'gemini') {
      if (!options.providerOptions) {
        options.providerOptions = {}
      }
      if (!options.providerOptions.gemini) {
        options.providerOptions.gemini = {}
      }
      if (!options.providerOptions.gemini.thinkingConfig) {
        options.providerOptions.gemini.thinkingConfig = {
          thinkingBudget: 0,
        }
      }
    }
    return provider === 'anthropic' ||
      provider === 'openai' ||
      provider === 'gemini'
      ? promptAiSdkStream({
          messages,
          model: model as Model,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
          maxTokens: 4096,
          temperature: 0,
          stopSequences,
          chargeUser,
          orgId: orgId ?? null, 
          repoUrl: repoUrl ?? null, 
        })
      : (() => {
          throw new Error(
            `Unknown model/provider: ${selectedModel}/${model}/${provider}`
          )
        })()
  }

  return { getStream, model }
}
