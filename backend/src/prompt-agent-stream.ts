import { providerModelNames } from '@codebuff/common/constants'
import { CoreMessage } from 'ai'

import { promptAiSdkStream } from './llm-apis/vercel-ai-sdk/ai-sdk'
import { AgentTemplate } from './templates/types'

import { CostMode, Model } from '@codebuff/common/constants'

// Helper function to throw error for unknown model/provider
function throwUnknownModelError(selectedModel: Model, model: Model, provider: string): never {
  throw new Error(
    `Unknown model/provider: ${selectedModel}/${model}/${provider}`
  )
}

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
      model: model as Model,
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
    return provider === 'openai' ||
      provider === 'gemini' ||
      provider === 'openrouter'
      ? promptAiSdkStream(options)
      : throwUnknownModelError(selectedModel, model, provider)
  }

  return getStream
}

export const getAgentStreamFromTemplate = (params: {
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined

  template: AgentTemplate
}) => {
  const { clientSessionId, fingerprintId, userInputId, userId, template } =
    params
  
  if (!template) {
    throw new Error('Agent template is null/undefined')
  }
  
  const { model, stopSequences } = template

  const getStream = (messages: CoreMessage[]) => {
    const options: Parameters<typeof promptAiSdkStream>[0] = {
      messages,
      model,
      stopSequences,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      maxTokens: 32_000,
    }

    // Add Gemini-specific options if needed
    const primaryModel = Array.isArray(model) ? model[0] : model
    const provider = providerModelNames[primaryModel as keyof typeof providerModelNames]
    
    if (provider === 'gemini') {
      if (!options.providerOptions) {
        options.providerOptions = {}
      }
      if (!options.providerOptions.gemini) {
        options.providerOptions.gemini = {}
      }
      if (!options.providerOptions.gemini.thinkingConfig) {
        options.providerOptions.gemini.thinkingConfig = { thinkingBudget: 128 }
      }
    }
    
    return promptAiSdkStream(options)
  }

  return getStream
}