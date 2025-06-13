import { CoreMessage } from 'ai'
import {
  AnthropicModel,
  CostMode,
  Model,
  providerModelNames,
} from 'common/constants'

import { promptAiSdkStream } from './llm-apis/vercel-ai-sdk/ai-sdk'

export const getAgentStream = (params: {
  costMode: CostMode
  selectedModel: Model
  stopSequences?: string[]
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  thinkingBudget?: number
  modelConfig?: { agentModel?: string; reasoningModel?: string } // Used by the backend for automatic evals
}) => {
  const {
    costMode,
    selectedModel,
    stopSequences,
    thinkingBudget,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
  } = params

  const model = selectedModel

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
          thinkingBudget: thinkingBudget ?? 128,
        }
      }
    }
    return provider === 'anthropic' ||
      provider === 'openai' ||
      provider === 'gemini'
      ? promptAiSdkStream(options)
      : (() => {
          throw new Error(
            `Unknown model/provider: ${selectedModel}/${model}/${provider}`
          )
        })()
  }

  return getStream
}
