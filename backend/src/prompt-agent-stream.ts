import {
  AnthropicModel,
  CostMode,
  getModelForMode,
  providerModelNames,
  shortModelNames,
} from 'common/constants'
import { Message } from 'common/types/message'

import { System } from './llm-apis/claude'
import {
  promptAiSdkStream,
  transformMessages,
} from './llm-apis/vercel-ai-sdk/ai-sdk'

export const getAgentStream = (params: {
  costMode: CostMode
  selectedModel: string | undefined
  stopSequences?: string[]
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
}) => {
  const {
    costMode,
    selectedModel,
    stopSequences,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
  } = params

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

  const model: string = fullSelectedModel ?? getModelForMode(costMode, 'agent')

  const provider = providerModelNames[model as keyof typeof providerModelNames]

  const getStream = (messages: Message[], system: System) => {
    const coreMessages = transformMessages(messages, system)
    return provider === 'anthropic' ||
      provider === 'openai' ||
      provider === 'gemini'
      ? promptAiSdkStream(coreMessages, {
          model: model as AnthropicModel,
          stopSequences,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
        })
      : (() => {
          throw new Error(
            `Unknown model/provider: ${selectedModel}/${model}/${provider}`
          )
        })()
  }

  return {
    model: model,
    getStream,
  }
}
